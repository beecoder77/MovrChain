#!/usr/bin/env bash
# Deploy MovrMilestoneReward, then approve + fund MOVR pool with explicit gas limits.
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

: "${MOVR_TOKEN:?}"
: "${ATTESTATION:?}"
# Club cut (1 MOVR/10km) requires a redeployed registry with setMilestoneReward
: "${CLUB_REGISTRY:?Set CLUB_REGISTRY in contracts/.env (redeploy clubs first)}"

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
FUND_AMOUNT="${FUND_AMOUNT:-100000000000000000000000}" # 100_000 MOVR

echo "1/3 Deploying MovrMilestoneReward (wire CLUB_REGISTRY=$CLUB_REGISTRY)…"
OUT=$(forge script script/DeployMilestoneReward.s.sol:DeployMilestoneReward \
  --rpc-url "$RPC" \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv)
echo "$OUT"

REWARD=$(echo "$OUT" | sed -n 's/.*MILESTONE_REWARD= //p' | tr -d '[:space:]' | head -1)
if [[ -z "$REWARD" || "$REWARD" != 0x* ]]; then
  # fallback: latest broadcast
  REWARD=$(python3 - <<'PY'
import json
from pathlib import Path
p = Path("broadcast/DeployMilestoneReward.s.sol/10143/run-latest.json")
d = json.loads(p.read_text())
for t in d.get("transactions", []):
    if t.get("contractName") == "MovrMilestoneReward" or t.get("transactionType") == "CREATE":
        addr = t.get("contractAddress")
        if addr:
            print(addr)
            break
PY
)
fi

echo "Deployed MILESTONE_REWARD=$REWARD"
echo "2/3 Approving MOVR…"
cast send "$MOVR_TOKEN" "approve(address,uint256)" "$REWARD" "$FUND_AMOUNT" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000

echo "3/3 Funding pool…"
cast send "$REWARD" "fund(uint256)" "$FUND_AMOUNT" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 300000

POOL=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$REWARD" --rpc-url "$RPC" | awk '{print $1}')
echo "Done. Pool MOVR balance: $POOL"
echo "Set MILESTONE_REWARD=$REWARD in contracts/.env and src/lib/contracts.ts"
