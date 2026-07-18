#!/usr/bin/env bash
# Redeploy the upgradeable Movr stack on Monad testnet (chain 10143).
#
# KEEPS (unchanged, no attestation dependency):
#   - MOVR_TOKEN   (holds balances)
#   - MOVR_PROFILE (holds handles/bios)
#
# DEPLAYs once via DeployUpgradeableStack:
#   Multisig (threshold from MULTISIG_THRESHOLD, default 1) + Timelock + UUPS proxies + ClubTreasury beacon
#
# After this deploy, published proxy addresses are STABLE — logic upgrades go through
# Multisig → Timelock (see ./upgrade.sh / UpgradeViaTimelock.s.sol). Do not redeploy to "fix" bugs.
#
# Requires in contracts/.env:
#   PRIVATE_KEY, MOVR_TOKEN, MULTISIG_SIGNER_2, MULTISIG_SIGNER_3
# Optional: MULTISIG_THRESHOLD=1 (creator-only) or 2 (production), ADMIN_ADDRESS, TIMELOCK_DELAY,
#           STAKING_POOL, MILESTONE_POOL
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then echo "Missing contracts/.env"; exit 1; fi
set -a; # shellcheck disable=SC1091
source .env; set +a

if [[ -z "${PRIVATE_KEY:-}" ]]; then echo "Set PRIVATE_KEY in contracts/.env"; exit 1; fi
if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then PRIVATE_KEY="0x${PRIVATE_KEY}"; fi
export PRIVATE_KEY

: "${MOVR_TOKEN:?Set MOVR_TOKEN in .env (kept from previous deploy)}"
: "${MULTISIG_SIGNER_2:?Set MULTISIG_SIGNER_2 (distinct from deployer)}"
: "${MULTISIG_SIGNER_3:?Set MULTISIG_SIGNER_3 (distinct from deployer and signer 2)}"

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
FORGE_FLAGS=(--rpc-url "$RPC" --broadcast --slow --legacy --timeout 120 --gas-estimate-multiplier 250 -vvv)
DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
STAKING_POOL="${STAKING_POOL:-1000000000000000000000000}"   # 1,000,000 MOVR
MILESTONE_POOL="${MILESTONE_POOL:-100000000000000000000000}" # 100,000 MOVR

echo "Deployer:   $DEPLOYER"
echo "MOVR_TOKEN: $MOVR_TOKEN (kept)"
echo "RPC:        $RPC"
echo

set_env() {
  python3 - "$1" "$2" <<'PY'
import sys, re, pathlib
key, val = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env")
lines = p.read_text().splitlines()
out, found = [], False
for l in lines:
    if re.match(rf'^{re.escape(key)}=', l):
        out.append(f"{key}={val}"); found = True
    else:
        out.append(l)
if not found:
    out.append(f"{key}={val}")
p.write_text("\n".join(out) + "\n")
PY
  export "$1"="$2"
  echo "  .env  $1=$2"
}

pick() {
  local out="$1" key="$2" bfile="$3" cname="$4" addr
  addr=$(printf '%s\n' "$out" | sed -n "s/.*${key}= //p" | head -1 | tr -d '[:space:]')
  if [[ "$addr" != 0x* && -f "$bfile" ]]; then
    addr=$(python3 - "$bfile" "$cname" <<'PY'
import json, sys
from pathlib import Path
d = json.loads(Path(sys.argv[1]).read_text())
want = sys.argv[2]
for t in d.get("transactions", []):
    if t.get("contractName") == want and t.get("contractAddress"):
        print(t["contractAddress"]); break
PY
)
  fi
  [[ "$addr" == 0x* ]] || { echo "ERROR: could not resolve $key / $cname" >&2; exit 1; }
  echo "$addr"
}

fund_pool() {
  local spender="$1" amount="$2" sel="$3" gas="${4:-300000}"
  echo "  minting + funding $amount to $spender"
  cast send "$MOVR_TOKEN" "mint(address,uint256)" "$DEPLOYER" "$amount" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 200000 >/dev/null
  cast send "$MOVR_TOKEN" "approve(address,uint256)" "$spender" "$amount" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000 >/dev/null
  cast send "$spender" "$sel" "$amount" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit "$gas" >/dev/null
}

echo "==> DeployUpgradeableStack (UUPS + Beacon + Timelock + Multisig)"
OUT=$(forge script script/DeployUpgradeableStack.s.sol:DeployUpgradeableStack "${FORGE_FLAGS[@]}")
echo "$OUT"
BF=broadcast/DeployUpgradeableStack.s.sol/10143/run-latest.json

set_env MOVR_MULTISIG   "$(pick "$OUT" MOVR_MULTISIG   "$BF" MovrMultisig)"
set_env TIMELOCK        "$(pick "$OUT" TIMELOCK        "$BF" TimelockController)"
set_env TREASURY_BEACON "$(pick "$OUT" TREASURY_BEACON "$BF" UpgradeableBeacon)"
set_env ATTESTATION     "$(pick "$OUT" ATTESTATION     "$BF" ERC1967Proxy)"
# Prefer console log picks for named proxies (multiple ERC1967Proxy txs)
set_env ATTESTATION      "$(printf '%s\n' "$OUT" | sed -n 's/.*ATTESTATION= //p' | head -1 | tr -d '[:space:]')"
set_env ACHIEVEMENT_NFT  "$(printf '%s\n' "$OUT" | sed -n 's/.*ACHIEVEMENT_NFT= //p' | head -1 | tr -d '[:space:]')"
set_env CLUB_MEMBER_NFT  "$(printf '%s\n' "$OUT" | sed -n 's/.*CLUB_MEMBER_NFT= //p' | head -1 | tr -d '[:space:]')"
set_env CLUB_REGISTRY    "$(printf '%s\n' "$OUT" | sed -n 's/.*CLUB_REGISTRY= //p' | head -1 | tr -d '[:space:]')"
set_env CLUB_BADGE_NFT   "$(printf '%s\n' "$OUT" | sed -n 's/.*CLUB_BADGE_NFT= //p' | head -1 | tr -d '[:space:]')"
set_env MOVR_STAKING     "$(printf '%s\n' "$OUT" | sed -n 's/.*MOVR_STAKING= //p' | head -1 | tr -d '[:space:]')"
set_env STAKING          "$MOVR_STAKING"
set_env MOVR_FEED        "$(printf '%s\n' "$OUT" | sed -n 's/.*MOVR_FEED= //p' | head -1 | tr -d '[:space:]')"
set_env MILESTONE_REWARD "$(printf '%s\n' "$OUT" | sed -n 's/.*MILESTONE_REWARD= //p' | head -1 | tr -d '[:space:]')"
set_env CLUB_CHALLENGES  "$(printf '%s\n' "$OUT" | sed -n 's/.*CLUB_CHALLENGES= //p' | head -1 | tr -d '[:space:]')"

echo "  funding staking + milestone pools"
fund_pool "$MOVR_STAKING" "$STAKING_POOL" "fundRewards(uint256)" 300000
fund_pool "$MILESTONE_REWARD" "$MILESTONE_POOL" "fund(uint256)" 300000

FE=../.env.local
cat > "$FE" <<EOF
# Auto-generated by contracts/redeploy-all.sh — Monad testnet (10143) UUPS proxies
VITE_CONTRACT_ADDRESS=$ATTESTATION
VITE_PROFILE_ADDRESS=${MOVR_PROFILE:-}
VITE_MOVR_TOKEN=$MOVR_TOKEN
VITE_ACHIEVEMENT_NFT=$ACHIEVEMENT_NFT
VITE_STAKING=$STAKING
VITE_CLUB_REGISTRY=$CLUB_REGISTRY
VITE_CLUB_MEMBER_NFT=$CLUB_MEMBER_NFT
VITE_CLUB_BADGE_NFT=$CLUB_BADGE_NFT
VITE_CLUB_CHALLENGES=$CLUB_CHALLENGES
VITE_MILESTONE_REWARD=$MILESTONE_REWARD
VITE_FEED_ADDRESS=$MOVR_FEED
EOF

echo "=============================================================="
echo "Upgradeable redeploy complete. Proxy addresses are now STABLE."
echo "Future logic changes: Multisig -> Timelock (${TIMELOCK_DELAY:-86400}s) -> upgrade"
echo "--------------------------------------------------------------"
echo "MOVR_MULTISIG    = $MOVR_MULTISIG"
echo "TIMELOCK         = $TIMELOCK"
echo "TREASURY_BEACON  = $TREASURY_BEACON"
echo "ATTESTATION      = $ATTESTATION"
echo "ACHIEVEMENT_NFT  = $ACHIEVEMENT_NFT"
echo "STAKING          = $STAKING"
echo "CLUB_REGISTRY    = $CLUB_REGISTRY"
echo "CLUB_MEMBER_NFT  = $CLUB_MEMBER_NFT"
echo "CLUB_BADGE_NFT   = $CLUB_BADGE_NFT"
echo "CLUB_CHALLENGES  = $CLUB_CHALLENGES"
echo "MILESTONE_REWARD = $MILESTONE_REWARD"
echo "MOVR_FEED        = $MOVR_FEED"
echo "MOVR_TOKEN       = $MOVR_TOKEN  (kept)"
echo "MOVR_PROFILE     = ${MOVR_PROFILE:-<unset>}  (kept)"
echo "--------------------------------------------------------------"
echo "Next: ./verify-all.sh  |  sync src/lib/contracts.ts + README once"
