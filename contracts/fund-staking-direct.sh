#!/usr/bin/env bash
# Fast fund staking WITHOUT Timelock delay.
# Deploys a new MovrStaking proxy (deployer = DEFAULT_ADMIN), wires clubs, fundRewards.
# Safe while totalStaked==0 on the old proxy. Updates .env + prints new address.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing contracts/.env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

: "${PRIVATE_KEY:?}"
: "${MOVR_TOKEN:?}"
: "${ACHIEVEMENT_NFT:?}"
: "${CLUB_REGISTRY:?}"
: "${CLUB_BADGE_NFT:?}"

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
AMOUNT="${REWARD_AMOUNT:-1000000000000000000000000}"

echo "=== Direct staking deploy + fund (no Timelock) ==="
echo "Old STAKING (kept, unused): ${STAKING:-unknown}"
echo "Reward amount: $AMOUNT"
echo

# Forge multi-tx batches can flake on Monad gas; deploy via forge, finish wiring via cast.
OUT=$(
  REWARD_AMOUNT="$AMOUNT" forge script script/DeployFundStakingDirect.s.sol:DeployFundStakingDirect \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast --legacy \
    --slow --gas-estimate-multiplier 200 -vv \
    2>&1 || true
)
printf '%s\n' "$OUT"

NEW_STAKING=$(printf '%s\n' "$OUT" | sed -n 's/^[[:space:]]*STAKING= //p' | head -1 | tr -d '[:space:]')
NEW_IMPL=$(printf '%s\n' "$OUT" | sed -n 's/^[[:space:]]*MOVR_STAKING_IMPL= //p' | head -1 | tr -d '[:space:]')

# Prefer address from broadcast JSON if forge partially succeeded
if [[ -z "$NEW_STAKING" || "$NEW_STAKING" != 0x* ]]; then
  BROADCAST="broadcast/DeployFundStakingDirect.s.sol/10143/run-latest.json"
  if [[ -f "$BROADCAST" ]]; then
    NEW_STAKING=$(python3 -c "import json; d=json.load(open('$BROADCAST'));
print(next((t['contractAddress'] for t in d.get('transactions',[]) if t.get('contractName')=='ERC1967Proxy' and t.get('contractAddress')), ''))")
    NEW_IMPL=$(python3 -c "import json; d=json.load(open('$BROADCAST'));
print(next((t['contractAddress'] for t in d.get('transactions',[]) if t.get('contractName')=='MovrStaking' and t.get('contractAddress')), ''))")
  fi
fi

if [[ -z "$NEW_STAKING" || "$NEW_STAKING" != 0x* ]]; then
  echo "Failed to parse new STAKING address."
  exit 1
fi

OWNER=$(cast wallet address --private-key "$PRIVATE_KEY")
RESERVE=$(cast call "$NEW_STAKING" "rewardReserve()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
if python3 -c "import sys; sys.exit(0 if int('$RESERVE') < int('$AMOUNT') else 1)"; then
  echo "Finishing wire + fund via cast (reserve=$RESERVE)…"
  REG=$(cast call "$NEW_STAKING" "clubRegistry()(address)" --rpc-url "$RPC")
  if [[ "${REG,,}" == "0x0000000000000000000000000000000000000000" ]]; then
    cast send "$NEW_STAKING" "setClubRegistry(address)" "$CLUB_REGISTRY" \
      --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 150000
  fi
  BAD=$(cast call "$NEW_STAKING" "clubBadges()(address)" --rpc-url "$RPC")
  if [[ "${BAD,,}" == "0x0000000000000000000000000000000000000000" ]]; then
    cast send "$NEW_STAKING" "setClubBadges(address)" "$CLUB_BADGE_NFT" \
      --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 150000
  fi
  ALLOW=$(cast call "$MOVR_TOKEN" "allowance(address,address)(uint256)" "$OWNER" "$NEW_STAKING" --rpc-url "$RPC" | awk '{print $1}')
  if python3 -c "import sys; sys.exit(0 if int('$ALLOW') < int('$AMOUNT') else 1)"; then
    cast send "$MOVR_TOKEN" "approve(address,uint256)" "$NEW_STAKING" "$AMOUNT" \
      --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000
  fi
  cast send "$NEW_STAKING" "fundRewards(uint256)" "$AMOUNT" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 300000
fi
RESERVE=$(cast call "$NEW_STAKING" "rewardReserve()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
echo "rewardReserve now: $RESERVE"

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    # portable in-place replace
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "${key}=${val}" >> .env
  fi
}

set_env STAKING "$NEW_STAKING"
set_env MOVR_STAKING "$NEW_STAKING"
if [[ -n "$NEW_IMPL" && "$NEW_IMPL" == 0x* ]]; then
  set_env MOVR_STAKING_IMPL "$NEW_IMPL"
fi

ROOT="$(cd .. && pwd)"
CONTRACTS_TS="$ROOT/src/lib/contracts.ts"
if [[ -f "$CONTRACTS_TS" ]]; then
  python3 - "$CONTRACTS_TS" "$NEW_STAKING" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
addr = sys.argv[2]
text = path.read_text()
# Replace baked-in STAKING_ADDRESS default only
pat = r'(export const STAKING_ADDRESS =\n  env\("VITE_STAKING"\) \?\?\n  \(")0x[a-fA-F0-9]{40}(" as const\);)'
new, n = re.subn(pat, rf"\g<1>{addr}\2", text)
if n != 1:
    raise SystemExit(f"contracts.ts STAKING replace failed (matches={n})")
path.write_text(new)
print(f"Updated {path}")
PY
fi

echo
echo "Done. New STAKING=$NEW_STAKING"
echo "Redeploy frontend so VITE/baked address picks this up."
echo "Note: Timelock still holds 1M MOVR for the OLD staking op — ignore or recover later via Timelock."
