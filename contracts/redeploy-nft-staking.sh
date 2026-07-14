#!/usr/bin/env bash
# Redeploy AchievementNFT + MovrStaking with data-URI achievement art.
# Keeps MOVR_TOKEN + ATTESTATION. Needs ~1M MOVR (or mint) and gas.
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

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi
export PRIVATE_KEY

: "${MOVR_TOKEN:?Set MOVR_TOKEN}"
: "${ATTESTATION:?Set ATTESTATION}"

# Regenerate art/URIs from repo root
(cd .. && node scripts/generate-achievement-art.mjs)

echo "Redeploying NFT + Staking with embedded badge metadata…"
forge script script/RedeployNftStaking.s.sol:RedeployNftStaking \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv

echo ""
echo "Copy the printed ACHIEVEMENT_NFT and STAKING into .env, then:"
echo "  ./fund-rewards.sh"
echo "For future art-only refreshes (after this redeploy): ./update-achievement-uris.sh"