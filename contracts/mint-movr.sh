#!/usr/bin/env bash
# Mint MOVR to the deployer (DEFAULT_ADMIN). Usage: ./mint-movr.sh [amount_tokens]
# Example: ./mint-movr.sh 10000000   # 10 million MOVR
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

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Set PRIVATE_KEY in contracts/.env"
  exit 1
fi

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi

: "${MOVR_TOKEN:?Set MOVR_TOKEN in .env}"

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
TOKENS="${1:-10000000}" # human units (default 10M)
WEI=$(python3 -c "print(int(${TOKENS}) * 10**18)")

TO="${MINT_TO:-$(cast wallet address --private-key "$PRIVATE_KEY")}"

echo "Minting ${TOKENS} MOVR (${WEI} wei) -> ${TO}"
cast send "$MOVR_TOKEN" "mint(address,uint256)" "$TO" "$WEI" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 200000

BAL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$TO" --rpc-url "$RPC" | awk '{print $1}')
echo "Done. Balance: $BAL wei ($(python3 -c "print(int('$BAL')/10**18)") MOVR)"
