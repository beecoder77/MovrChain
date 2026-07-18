#!/usr/bin/env bash
# Fund MovrMilestoneReward claim pool (MOVR balance on the contract).
# Direct ERC20 transfer is enough — claim() only checks balanceOf(this).
# Prefer ./fund-all-pools.sh to top both milestone + schedule staking.
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

: "${PRIVATE_KEY:?Set PRIVATE_KEY in .env}"
: "${MOVR_TOKEN:?Set MOVR_TOKEN in .env}"
: "${MILESTONE_REWARD:?Set MILESTONE_REWARD in .env}"

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
# Default 1,000,000 MOVR
amount="${MILESTONE_POOL:-1000000000000000000000000}"

OWNER=$(cast wallet address --private-key "$PRIVATE_KEY")
BAL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$OWNER" --rpc-url "$RPC" | awk '{print $1}')
POOL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | awk '{print $1}')

echo "Owner:     $OWNER"
echo "Milestone: $MILESTONE_REWARD"
echo "Owner MOVR: $BAL"
echo "Pool now:   $POOL"
echo "Add amount: $amount"

python3 - <<PY
import sys
bal, amt = int("$BAL"), int("$amount")
if bal < amt:
    need = amt - bal
    print(f"Need mint of {need} — run: ./mint-movr.sh or ./fund-all-pools.sh", file=sys.stderr)
    sys.exit(1)
PY

cast send "$MOVR_TOKEN" "transfer(address,uint256)" "$MILESTONE_REWARD" "$amount" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000

POOL_AFTER=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | awk '{print $1}')
echo "Done. Milestone pool MOVR balance: $POOL_AFTER"
