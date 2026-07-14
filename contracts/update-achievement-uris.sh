#!/usr/bin/env bash
# Update achievement metadata URIs on a contract that has setAchievementURI.
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi
export PRIVATE_KEY

: "${ACHIEVEMENT_NFT:?Set ACHIEVEMENT_NFT}"

(cd .. && node scripts/generate-achievement-art.mjs)

forge script script/UpdateAchievementURIs.s.sol:UpdateAchievementURIs \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv
