#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing contracts/.env — copy .env.example and set PRIVATE_KEY (Monad testnet funded wallet)."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -z "${PRIVATE_KEY:-}" || "$PRIVATE_KEY" == 0xyour_deployer_private_key_here ]]; then
  echo "Set a real PRIVATE_KEY in contracts/.env first."
  exit 1
fi

# forge vm.envUint requires a 0x-prefixed hex string
if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi
export PRIVATE_KEY

ADDR=$(cast wallet address --private-key "$PRIVATE_KEY")
BAL=$(cast balance "$ADDR" --rpc-url https://testnet-rpc.monad.xyz)
echo "Deployer: $ADDR"
echo "Balance (wei): $BAL"

if [[ "$BAL" == "0" ]]; then
  echo "Balance is 0. Fund via https://faucet.monad.xyz/ then re-run."
  exit 1
fi

# --slow: one-by-one (Monad same-block races)
# --gas-estimate-multiplier: Monad eth_estimateGas underestimates; fundRewards OOGd at ~72k (needs ~95k+)
forge script script/DeployMovrChain.s.sol:DeployMovrChain \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv
