#!/usr/bin/env bash
# Deploy MovrProfile to Monad testnet and print VITE_PROFILE_ADDRESS.
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
export PRIVATE_KEY

ADDR=$(cast wallet address --private-key "$PRIVATE_KEY")
BAL=$(cast balance "$ADDR" --rpc-url https://testnet-rpc.monad.xyz)
echo "Deployer: $ADDR"
echo "Balance (wei): $BAL"

forge script script/DeployMovrProfile.s.sol:DeployMovrProfile \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv
