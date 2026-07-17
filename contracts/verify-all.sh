#!/usr/bin/env bash
# Verify every deployed MovrChain contract on Monad testnet (chain 10143)
# via Etherscan API v2 (powers testnet.monadscan.com).
#
# Why not plain `forge verify-contract`?
# Foundry 1.0.0-stable often omits `chainid` on the verify POST, which Etherscan
# v2 rejects with NOTOK "Missing or unsupported chainid". This script submits
# Standard-JSON directly with `?chainid=10143` so verification works.
#
# Requires MONADSCAN_API_KEY or ETHERSCAN_API_KEY in contracts/.env
# (create one at https://etherscan.io/apidashboard).
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then echo "Missing contracts/.env"; exit 1; fi
set -a; # shellcheck disable=SC1091
source .env; set +a

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then PRIVATE_KEY="0x${PRIVATE_KEY}"; fi
DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")

: "${MOVR_TOKEN:?}"; : "${ATTESTATION:?}"; : "${ACHIEVEMENT_NFT:?}"
: "${STAKING:?}"; : "${CLUB_REGISTRY:?}"; : "${CLUB_MEMBER_NFT:?}"
: "${CLUB_BADGE_NFT:?}"; : "${CLUB_CHALLENGES:?}"; : "${MILESTONE_REWARD:?}"; : "${MOVR_FEED:?}"

API_KEY="${ETHERSCAN_API_KEY:-${MONADSCAN_API_KEY:-}}"
if [[ -z "$API_KEY" ]]; then
  echo "ERROR: set MONADSCAN_API_KEY (Etherscan API key) in contracts/.env"
  echo "Create one at https://etherscan.io/apidashboard"
  exit 1
fi

# Etherscan v2 — chainid MUST be a query param (not omitted by forge)
API_URL="https://api.etherscan.io/v2/api?chainid=10143"
COMPILER="v0.8.24+commit.e11b9ed9"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Route: Etherscan API v2 → MonadScan testnet (chain 10143)"
echo "Explorer: https://testnet.monadscan.com"
echo

enc() { cast abi-encode "$@"; }

# Strip leading 0x — Etherscan constructorArguements field prefers bare hex
bare_hex() {
  local h="$1"
  if [[ "$h" == 0x* || "$h" == 0X* ]]; then echo "${h:2}"; else echo "$h"; fi
}

submit_verify() { # addr  path:Name  [ctor_args_hex]
  local addr="$1" target="$2" args_hex="${3:-}"
  local name="${target##*:}"
  local src_path="${target%%:*}"
  local json_file="$TMPDIR/${name}.json"
  local resp guid status

  echo "==> $target  ($addr)"

  # Build Standard-JSON from the local forge project (includes viaIR + optimizer)
  forge verify-contract "$addr" "$target" --show-standard-json-input >"$json_file"

  # contractname for standard-json must match a sources key + :ContractName
  # Prefer the path forge embeds (usually src/Foo.sol)
  local contract_name
  contract_name=$(python3 - "$json_file" "$src_path" "$name" <<'PY'
import json, sys
from pathlib import Path
d = json.loads(Path(sys.argv[1]).read_text())
src_path, name = sys.argv[2], sys.argv[3]
sources = d.get("sources", {})
# exact / suffix / basename match
candidates = [src_path, src_path.lstrip("./")]
base = src_path.split("/")[-1]
for k in sources:
    if k == src_path or k.endswith("/" + src_path) or k.endswith("/" + base) or k == base:
        print(f"{k}:{name}")
        break
else:
    # fallback: first key ending with the filename
    for k in sources:
        if k.endswith(base):
            print(f"{k}:{name}")
            break
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
    echo "  !! submit failed for $target"
    echo
    return 0
  fi

  # Poll checkverifystatus (up to ~2 min)
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
      echo "  !! verification failed for $target"
      echo
      return 0
    fi
  done
  echo "  !! still pending for $target (check explorer later)"
  echo
}

submit_verify "$MOVR_TOKEN"       src/MovrToken.sol:MovrToken                     "$(enc 'constructor(address)' "$DEPLOYER")"
[[ -n "${MOVR_PROFILE:-}" ]] && submit_verify "$MOVR_PROFILE" src/MovrProfile.sol:MovrProfile ""

submit_verify "$ATTESTATION"      src/MovrChainAttestation.sol:MovrChainAttestation "$(enc 'constructor(address)' "$DEPLOYER")"
submit_verify "$ACHIEVEMENT_NFT"  src/AchievementNFT.sol:AchievementNFT           "$(enc 'constructor(address,address)' "$DEPLOYER" "$ATTESTATION")"
submit_verify "$CLUB_MEMBER_NFT"  src/ClubMemberNFT.sol:ClubMemberNFT             "$(enc 'constructor(address)' "$DEPLOYER")"
submit_verify "$CLUB_REGISTRY"    src/MovrClubRegistry.sol:MovrClubRegistry       "$(enc 'constructor(address,address)' "$MOVR_TOKEN" "$CLUB_MEMBER_NFT")"
submit_verify "$CLUB_BADGE_NFT"   src/ClubBadgeNFT.sol:ClubBadgeNFT               "$(enc 'constructor(address,address)' "$DEPLOYER" "$CLUB_REGISTRY")"
submit_verify "$STAKING"          src/MovrStaking.sol:MovrStaking                 "$(enc 'constructor(address,address,address)' "$DEPLOYER" "$MOVR_TOKEN" "$ACHIEVEMENT_NFT")"
submit_verify "$MOVR_FEED"        src/MovrFeed.sol:MovrFeed                       "$(enc 'constructor(address)' "$ATTESTATION")"
submit_verify "$MILESTONE_REWARD" src/MovrMilestoneReward.sol:MovrMilestoneReward "$(enc 'constructor(address,address,address)' "$DEPLOYER" "$MOVR_TOKEN" "$ATTESTATION")"
submit_verify "$CLUB_CHALLENGES"  src/MovrClubChallenges.sol:MovrClubChallenges   "$(enc 'constructor(address,address)' "$MOVR_TOKEN" "$CLUB_REGISTRY")"

echo "Done."
echo "Primary submission address: $ATTESTATION"
echo "https://testnet.monadscan.com/address/$ATTESTATION#code"
