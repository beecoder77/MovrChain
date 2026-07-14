#!/usr/bin/env bash
# Fund MovrStaking reward pool.
# Uses cast + explicit gas limit — forge's Monad gas estimate underestimates
# and OOGs fundRewards (~72k limit vs ~95k needed).
set -euo pipefail
cd "$(dirname "$0")"

gte() { python3 -c "import sys; sys.exit(0 if int(sys.argv[1]) >= int(sys.argv[2]) else 1)" "$1" "$2"; }
sub() { python3 -c "print(int(sys.argv[1]) - int(sys.argv[2]))" "$1" "$2"; }
is_zero() { python3 -c "import sys; sys.exit(0 if int(sys.argv[1]) == 0 else 1)" "$1"; }

if [[ ! -f .env ]]; then
  echo "Missing contracts/.env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Set PRIVATE_KEY in contracts/.env"
  exit 1
fi

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi

: "${MOVR_TOKEN:?Set MOVR_TOKEN in .env}"
: "${STAKING:?Set STAKING in .env}"

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
AMOUNT="${REWARD_AMOUNT:-1000000000000000000000000}" # 1_000_000 ether
GAS_LIMIT="${GAS_LIMIT:-300000}"

OWNER=$(cast wallet address --private-key "$PRIVATE_KEY")
# cast may append " [1e24]" — take first field
BAL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$OWNER" --rpc-url "$RPC" | awk '{print $1}')
ALLOW=$(cast call "$MOVR_TOKEN" "allowance(address,address)(uint256)" "$OWNER" "$STAKING" --rpc-url "$RPC" | awk '{print $1}')
POOL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$STAKING" --rpc-url "$RPC" | awk '{print $1}')

echo "Owner:   $OWNER"
echo "MOVR:    $MOVR_TOKEN"
echo "Staking: $STAKING"
echo "Owner MOVR balance: $BAL"
echo "Allowance:          $ALLOW"
echo "Pool (staking):     $POOL"
echo "Funding amount:     $AMOUNT"

if ! is_zero "$POOL" && [[ "${FORCE:-}" != "1" ]]; then
  echo "Staking pool already funded ($POOL). Re-run with FORCE=1 to add more."
  exit 0
fi

if ! gte "$BAL" "$AMOUNT"; then
  NEED=$(sub "$AMOUNT" "$BAL")
  echo "Minting $NEED MOVR..."
  cast send "$MOVR_TOKEN" "mint(address,uint256)" "$OWNER" "$NEED" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 200000
fi

if ! gte "$ALLOW" "$AMOUNT"; then
  echo "Approving staking for $AMOUNT..."
  cast send "$MOVR_TOKEN" "approve(address,uint256)" "$STAKING" "$AMOUNT" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000
else
  echo "Allowance already sufficient - skipping approve."
fi

echo "Calling fundRewards(${AMOUNT}) with gas-limit ${GAS_LIMIT}..."
cast send "$STAKING" "fundRewards(uint256)" "$AMOUNT" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit "${GAS_LIMIT}"

POOL_AFTER=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$STAKING" --rpc-url "$RPC" | awk '{print $1}')
echo "Done. Staking MOVR balance: $POOL_AFTER"
