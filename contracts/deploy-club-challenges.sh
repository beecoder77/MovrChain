#!/usr/bin/env bash
# Deploy MovrClubChallenges and wire registry + existing club treasuries.
# Prerequisite: registry from current MovrClubRegistry (./deploy-clubs.sh).
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

if [[ -z "${CLUB_REGISTRY:-}" ]]; then
  echo "Set CLUB_REGISTRY in contracts/.env (from deploy-clubs.sh output)"
  exit 1
fi

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi
export PRIVATE_KEY
export MOVR_TOKEN="${MOVR_TOKEN:-0xD95C0f1F5F5F73e32F87B4f76d6a79809911B7BF}"

echo "CLUB_REGISTRY=$CLUB_REGISTRY"
echo "MOVR_TOKEN=$MOVR_TOKEN"

forge script script/DeployClubChallenges.s.sol:DeployClubChallenges \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv
