#!/usr/bin/env bash
# Fast top-up MovrMilestoneReward to at least TARGET MOVR (default 1_000_000).
# Uses ERC20 transfer (claim checks balanceOf). Mints if owner balance is short.
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
# 1_000_000 MOVR — ignore empty MILESTONE_POOL from .env
TARGET="1000000000000000000000000"
if [[ -n "${MILESTONE_POOL:-}" ]]; then
  TARGET="$MILESTONE_POOL"
fi

wei() { awk '{print $1}'; }

OWNER=$(cast wallet address --private-key "$PRIVATE_KEY")
BAL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$OWNER" --rpc-url "$RPC" | wei)
POOL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | wei)
ADD=$(python3 -c "print(max(0, int('$TARGET') - int('$POOL')))")

echo "Owner:     $OWNER"
echo "Milestone: $MILESTONE_REWARD"
echo "Owner MOVR: $BAL"
echo "Pool now:   $POOL"
echo "Target:     $TARGET"
echo "Will add:   $ADD"

if [[ "$ADD" == "0" ]]; then
  echo "Already ≥ target. Nothing to do."
  exit 0
fi

if python3 -c "import sys; sys.exit(0 if int('$BAL') < int('$ADD') else 1)"; then
  NEED=$(python3 -c "print(int('$ADD') - int('$BAL'))")
  echo "Minting $NEED MOVR…"
  cast send "$MOVR_TOKEN" "mint(address,uint256)" "$OWNER" "$NEED" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 200000
fi

echo "Transferring $ADD MOVR → milestone…"
cast send "$MOVR_TOKEN" "transfer(address,uint256)" "$MILESTONE_REWARD" "$ADD" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000

POOL_AFTER=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | wei)
echo "Done. Milestone pool: $POOL_AFTER"
