#!/usr/bin/env bash
# Deploy MovrFeed to Monad testnet.
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

: "${ATTESTATION:?}"

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"

echo "Deploying MovrFeed…"
OUT=$(forge script script/DeployMovrFeed.s.sol:DeployMovrFeed \
  --rpc-url "$RPC" \
  --broadcast \
  --slow \
  --legacy \
  --gas-estimate-multiplier 250 \
  -vvv)
echo "$OUT"

FEED=$(echo "$OUT" | sed -n 's/.*MOVR_FEED= //p' | tr -d '[:space:]' | head -1)
if [[ -z "$FEED" || "$FEED" != 0x* ]]; then
  FEED=$(python3 - <<'PY'
import json
from pathlib import Path
p = Path("broadcast/DeployMovrFeed.s.sol/10143/run-latest.json")
d = json.loads(p.read_text())
for t in d.get("transactions", []):
    if t.get("contractName") == "MovrFeed" or t.get("transactionType") == "CREATE":
        addr = t.get("contractAddress")
        if addr:
            print(addr)
            break
PY
)
fi

echo "Deployed MOVR_FEED=$FEED"
if grep -q '^MOVR_FEED=' .env 2>/dev/null; then
  sed -i.bak "s/^MOVR_FEED=.*/MOVR_FEED=$FEED/" .env && rm -f .env.bak
else
  echo "MOVR_FEED=$FEED" >> .env
fi
echo "Set FEED_ADDRESS=$FEED in src/lib/contracts.ts"
