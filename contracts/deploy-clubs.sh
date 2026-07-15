#!/usr/bin/env bash
# Deploy club registry + member NFT + badge NFT + staking (donate-enabled).
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing contracts/.env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
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

# Defaults from current frontend bake-ins if unset
export MOVR_TOKEN="${MOVR_TOKEN:-0xD95C0f1F5F5F73e32F87B4f76d6a79809911B7BF}"
export ACHIEVEMENT_NFT="${ACHIEVEMENT_NFT:-0xe17320E0440Bc1a2CC426772f1712fB5b1627466}"

ADDR=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "Deployer: $ADDR"
echo "MOVR_TOKEN=$MOVR_TOKEN"
echo "ACHIEVEMENT_NFT=$ACHIEVEMENT_NFT"

forge script script/DeployClubs.s.sol:DeployClubs \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv
