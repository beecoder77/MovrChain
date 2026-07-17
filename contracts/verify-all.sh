#!/usr/bin/env bash
# Verify MovrChain contracts on Monad testnet (chain 10143) via Etherscan API v2.
# UUPS proxies: resolves EIP-1967 implementation and verifies that bytecode.
# Also verifies Multisig / Timelock / Beacon when present in .env.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then echo "Missing contracts/.env"; exit 1; fi
set -a; # shellcheck disable=SC1091
source .env; set +a

if [[ -n "${PRIVATE_KEY:-}" ]]; then
  if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then PRIVATE_KEY="0x${PRIVATE_KEY}"; fi
  DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
else
  DEPLOYER="${ADMIN_ADDRESS:-}"
fi

: "${MOVR_TOKEN:?}"; : "${ATTESTATION:?}"; : "${ACHIEVEMENT_NFT:?}"
: "${STAKING:?}"; : "${CLUB_REGISTRY:?}"; : "${CLUB_MEMBER_NFT:?}"
: "${CLUB_BADGE_NFT:?}"; : "${CLUB_CHALLENGES:?}"; : "${MILESTONE_REWARD:?}"; : "${MOVR_FEED:?}"

API_KEY="${ETHERSCAN_API_KEY:-${MONADSCAN_API_KEY:-}}"
if [[ -z "$API_KEY" ]]; then
  echo "ERROR: set MONADSCAN_API_KEY (Etherscan API key) in contracts/.env"
  exit 1
fi

API_URL="https://api.etherscan.io/v2/api?chainid=10143"
COMPILER="v0.8.24+commit.e11b9ed9"
RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
IMPL_SLOT="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Route: Etherscan API v2 → MonadScan testnet (chain 10143)"
echo

enc() { cast abi-encode "$@"; }
bare_hex() {
  local h="$1"
  if [[ "$h" == 0x* || "$h" == 0X* ]]; then echo "${h:2}"; else echo "$h"; fi
}

impl_of() {
  local proxy="$1" raw
  raw=$(cast storage "$proxy" "$IMPL_SLOT" --rpc-url "$RPC")
  # storage is 32-byte left-padded address
  echo "0x${raw: -40}"
}

submit_verify() { # addr path:Name [ctor_args_hex]
  local addr="$1" target="$2" args_hex="${3:-}"
  local name="${target##*:}"
  local src_path="${target%%:*}"
  local json_file="$TMPDIR/${name}.json"
  local resp guid status

  echo "==> $target  ($addr)"
  forge verify-contract "$addr" "$target" --show-standard-json-input >"$json_file"

  local contract_name
  contract_name=$(python3 - "$json_file" "$src_path" "$name" <<'PY'
import json, sys
from pathlib import Path
d = json.loads(Path(sys.argv[1]).read_text())
src_path, name = sys.argv[2], sys.argv[3]
sources = d.get("sources", {})
base = src_path.split("/")[-1]
for k in sources:
    if k == src_path or k.endswith("/" + src_path) or k.endswith("/" + base) or k == base:
        print(f"{k}:{name}"); break
else:
    for k in sources:
        if k.endswith(base):
            print(f"{k}:{name}"); break
    else:
        print(f"{src_path}:{name}")
PY
)

  local -a curl_args=(
    -sS -X POST "$API_URL"
    --data-urlencode "module=contract"
    --data-urlencode "action=verifysourcecode"
    --data-urlencode "apikey=$API_KEY"
    --data-urlencode "contractaddress=$addr"
    --data-urlencode "sourceCode@$json_file"
    --data-urlencode "codeformat=solidity-standard-json-input"
    --data-urlencode "contractname=$contract_name"
    --data-urlencode "compilerversion=$COMPILER"
  )
  if [[ -n "$args_hex" ]]; then
    curl_args+=(--data-urlencode "constructorArguements=$(bare_hex "$args_hex")")
  fi

  resp=$(curl "${curl_args[@]}")
  echo "  submit: $resp"
  guid=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',''))" <<<"$resp")
  status=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','0'))" <<<"$resp")
  if [[ "$status" != "1" ]]; then
    echo "  !! submit failed (may already be verified)"
    echo
    return 0
  fi

  for i in $(seq 1 12); do
    sleep 10
    resp=$(curl -sS -G "$API_URL" \
      --data-urlencode "module=contract" \
      --data-urlencode "action=checkverifystatus" \
      --data-urlencode "guid=$guid" \
      --data-urlencode "apikey=$API_KEY")
    echo "  poll $i: $resp"
    if echo "$resp" | grep -qi "Pass - Verified"; then
      echo "  ✓ verified → https://testnet.monadscan.com/address/$addr#code"
      echo
      return 0
    fi
    if echo "$resp" | grep -qi "Fail"; then
      echo "  !! verification failed"
      echo
      return 0
    fi
  done
  echo "  !! still pending"
  echo
}

verify_uups() { # proxy_addr  path:Name
  local proxy="$1" target="$2"
  local impl
  impl=$(impl_of "$proxy")
  echo "Proxy $proxy → impl $impl"
  # Implementations use empty constructor (_disableInitializers)
  submit_verify "$impl" "$target" ""
}

# Kept non-upgradeable
submit_verify "$MOVR_TOKEN" src/MovrToken.sol:MovrToken "$(enc 'constructor(address)' "$DEPLOYER")"
[[ -n "${MOVR_PROFILE:-}" ]] && submit_verify "$MOVR_PROFILE" src/MovrProfile.sol:MovrProfile ""

# Governance
if [[ -n "${MOVR_MULTISIG:-}" && -n "${MULTISIG_SIGNER_2:-}" && -n "${MULTISIG_SIGNER_3:-}" ]]; then
  submit_verify "$MOVR_MULTISIG" src/MovrMultisig.sol:MovrMultisig \
    "$(enc 'constructor(address,address,address)' "$DEPLOYER" "$MULTISIG_SIGNER_2" "$MULTISIG_SIGNER_3")"
fi
if [[ -n "${TIMELOCK:-}" ]]; then
  echo "==> TimelockController ($TIMELOCK) — verify manually if needed (complex ctor encoding)"
fi
if [[ -n "${TREASURY_BEACON:-}" && -n "${TIMELOCK:-}" ]]; then
  # Beacon ctor: (implementation, initialOwner) — impl from env or skip
  if [[ -n "${TREASURY_IMPL:-}" ]]; then
    submit_verify "$TREASURY_BEACON" \
      lib/openzeppelin-contracts/contracts/proxy/beacon/UpgradeableBeacon.sol:UpgradeableBeacon \
      "$(enc 'constructor(address,address)' "$TREASURY_IMPL" "$TIMELOCK")"
  fi
  [[ -n "${TREASURY_IMPL:-}" ]] && submit_verify "$TREASURY_IMPL" src/ClubTreasury.sol:ClubTreasury ""
fi

# UUPS implementations behind proxies
verify_uups "$ATTESTATION"      src/MovrChainAttestation.sol:MovrChainAttestation
verify_uups "$ACHIEVEMENT_NFT"  src/AchievementNFT.sol:AchievementNFT
verify_uups "$CLUB_MEMBER_NFT"  src/ClubMemberNFT.sol:ClubMemberNFT
verify_uups "$CLUB_REGISTRY"    src/MovrClubRegistry.sol:MovrClubRegistry
verify_uups "$CLUB_BADGE_NFT"   src/ClubBadgeNFT.sol:ClubBadgeNFT
verify_uups "$STAKING"          src/MovrStaking.sol:MovrStaking
verify_uups "$MOVR_FEED"        src/MovrFeed.sol:MovrFeed
verify_uups "$MILESTONE_REWARD" src/MovrMilestoneReward.sol:MovrMilestoneReward
verify_uups "$CLUB_CHALLENGES"  src/MovrClubChallenges.sol:MovrClubChallenges

echo "Done."
echo "Primary proxy (attestation): $ATTESTATION"
echo "https://testnet.monadscan.com/address/$ATTESTATION#code"
