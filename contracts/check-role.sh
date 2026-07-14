#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

RPC_URL="${RPC_URL:-https://testnet-rpc.monad.xyz}"

if [[ ! -f .env ]]; then
  echo "Missing contracts/.env — copy .env.example and set addresses."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

# forge vm.envUint / cast need 0x-prefixed hex
if [[ -n "${PRIVATE_KEY:-}" && "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
  export PRIVATE_KEY
fi

# Address to check: arg > CHECK_ADDRESS > derive from PRIVATE_KEY
CHECK="${1:-${CHECK_ADDRESS:-}}"
if [[ -z "$CHECK" && -n "${PRIVATE_KEY:-}" && "$PRIVATE_KEY" != 0xyour_deployer_private_key_here ]]; then
  CHECK=$(cast wallet address --private-key "$PRIVATE_KEY")
fi

if [[ -z "$CHECK" ]]; then
  echo "Usage: ./check-role.sh [0xAddress]"
  echo "Or set CHECK_ADDRESS (or PRIVATE_KEY) in contracts/.env"
  exit 1
fi

export CHECK_ADDRESS="$CHECK"

if [[ -z "${MOVR_TOKEN:-}" && -z "${ACHIEVEMENT_NFT:-}" && -z "${STAKING:-}" ]]; then
  echo "Set at least one of MOVR_TOKEN, ACHIEVEMENT_NFT, STAKING in contracts/.env"
  exit 1
fi

echo "RPC: $RPC_URL"
echo "Checking: $CHECK_ADDRESS"
echo ""

forge script script/CheckRole.s.sol:CheckRole \
  --rpc-url "$RPC_URL" \
  -vvv
