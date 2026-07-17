#!/usr/bin/env bash
# Redeploy the full attestation-dependent stack on Monad testnet (chain 10143)
# after hardening MovrChainAttestation.
#
# KEEPS (unchanged, no attestation dependency):
#   - MOVR_TOKEN   (holds balances)
#   - MOVR_PROFILE (holds handles/bios)
#
# REDEPLOYS in dependency order (every one-time/immutable link is re-wired fresh):
#   1. MovrChainAttestation  (hardened) + AchievementNFT (seeded)
#   2. ClubMemberNFT + MovrClubRegistry + ClubBadgeNFT + MovrStaking (+ wire + fund pool)
#   3. MovrFeed              (reads attestation runs)
#   4. MovrMilestoneReward   (+ wire registry club-cut + fund pool)
#   5. MovrClubChallenges    (+ wire registry)
#
# Updates contracts/.env in place and writes ../.env.local for the frontend.
#
# If step 1 partially landed (forge hung on a dropped mempool tx), recover with:
#   SKIP_STEP1=1 ./redeploy-all.sh
# Optional overrides:
#   ATTESTATION=0x... ACHIEVEMENT_NFT=0x... SKIP_STEP1=1 ./redeploy-all.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then echo "Missing contracts/.env"; exit 1; fi
set -a; # shellcheck disable=SC1091
source .env; set +a

if [[ -z "${PRIVATE_KEY:-}" ]]; then echo "Set PRIVATE_KEY in contracts/.env"; exit 1; fi
if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then PRIVATE_KEY="0x${PRIVATE_KEY}"; fi
export PRIVATE_KEY

: "${MOVR_TOKEN:?Set MOVR_TOKEN in .env (kept from previous deploy)}"

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
# --timeout fails instead of waiting forever on dropped mempool txs
FORGE_FLAGS=(--rpc-url "$RPC" --broadcast --slow --legacy --timeout 90 --gas-estimate-multiplier 250 -vvv)
DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
STAKING_POOL="${STAKING_POOL:-1000000000000000000000000}"   # 1,000,000 MOVR
MILESTONE_POOL="${MILESTONE_POOL:-100000000000000000000000}" # 100,000 MOVR

# Known addresses from the partial step-1 deploy (override via env if needed)
PARTIAL_ATTESTATION="${ATTESTATION_OVERRIDE:-0x70FA6Fa42741f2890647e42a8cBE102FefD65c38}"
PARTIAL_ACHIEVEMENT_NFT="${ACHIEVEMENT_NFT_OVERRIDE:-0xf54b551c5DEc5E5da56cBB9364cC7F12Ce38043e}"

echo "Deployer:   $DEPLOYER"
echo "MOVR_TOKEN: $MOVR_TOKEN (kept)"
echo "RPC:        $RPC"
echo

# ---- helpers ---------------------------------------------------------------
set_env() { # key value  -> update (or append) contracts/.env
  python3 - "$1" "$2" <<'PY'
import sys, re, pathlib
key, val = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env")
lines = p.read_text().splitlines()
out, found = [], False
for l in lines:
    if re.match(rf'^{re.escape(key)}=', l):
        out.append(f"{key}={val}"); found = True
    else:
        out.append(l)
if not found:
    out.append(f"{key}={val}")
p.write_text("\n".join(out) + "\n")
PY
  export "$1"="$2"
  echo "  .env  $1=$2"
}

pick() { # output KEY broadcast_file ContractName -> prints 0x address
  local out="$1" key="$2" bfile="$3" cname="$4" addr
  # head -1 before stripping whitespace — otherwise duplicate log lines concatenate
  addr=$(printf '%s\n' "$out" | sed -n "s/.*${key}= //p" | head -1 | tr -d '[:space:]')
  if [[ "$addr" != 0x* && -f "$bfile" ]]; then
    addr=$(python3 - "$bfile" "$cname" <<'PY'
import json, sys
from pathlib import Path
d = json.loads(Path(sys.argv[1]).read_text())
for t in d.get("transactions", []):
    if t.get("contractName") == sys.argv[2] and t.get("contractAddress"):
        print(t["contractAddress"]); break
PY
)
  fi
  [[ "$addr" == 0x* ]] || { echo "ERROR: could not resolve $cname address" >&2; exit 1; }
  echo "$addr"
}

fund_pool() { # spender amount fund_selector [gas]
  local spender="$1" amount="$2" sel="$3" gas="${4:-300000}"
  echo "  minting + funding $amount to $spender"
  cast send "$MOVR_TOKEN" "mint(address,uint256)" "$DEPLOYER" "$amount" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 200000 >/dev/null
  cast send "$MOVR_TOKEN" "approve(address,uint256)" "$spender" "$amount" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000 >/dev/null
  cast send "$spender" "$sel" "$amount" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit "$gas" >/dev/null
}

read_uri() { # slug -> prints uri without trailing newline
  python3 - "$1" <<'PY'
from pathlib import Path
import sys
p = Path("metadata") / f"{sys.argv[1]}.uri.txt"
print(p.read_text().rstrip("\n"), end="")
PY
}

# Criterion: 0=SingleRunMeters, 1=StreakDays, 2=TotalDistanceMeters
# Monad charges gas_limit (not gas_used) — estimate then add 50% headroom instead of a huge fixed limit.
create_achievement() {
  local nft="$1" name="$2" desc="$3" criterion="$4" threshold="$5" boost="$6" slug="$7"
  local uri est gas
  uri=$(read_uri "$slug")
  echo "  seeding: $name"
  est=$(cast estimate "$nft" \
    "createAchievement(string,string,uint8,uint256,uint256,string)" \
    "$name" "$desc" "$criterion" "$threshold" "$boost" "$uri" \
    --from "$DEPLOYER" --rpc-url "$RPC")
  gas=$(python3 -c "print(int(int('$est') * 1.5))")
  echo "    estimate=$est gas_limit=$gas"
  cast send "$nft" \
    "createAchievement(string,string,uint8,uint256,uint256,string)" \
    "$name" "$desc" "$criterion" "$threshold" "$boost" "$uri" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit "$gas" >/dev/null
}

finish_seeds() { # nft_address — create any missing catalog entries (idempotent by nextAchievementId)
  local nft="$1" next
  next_id() { cast call "$nft" "nextAchievementId()(uint256)" --rpc-url "$RPC" | awk '{print $1}'; }

  next=$(next_id)
  echo "  nextAchievementId=$next (need 11 = 10 achievements seeded)"
  # Catalog order matches DeployAttestation._seedAchievements (ids 1..10).
  # nextAchievementId is the next free id; 5 seeds landed → next=6.
  if (( next == 6 )); then
    create_achievement "$nft" "7-Day Streak" "Run at least 1 km per day for 7 consecutive days" 1 7 700 streak-7
    next=$(next_id)
  fi
  if (( next == 7 )); then
    create_achievement "$nft" "14-Day Streak" "Run at least 1 km per day for 14 consecutive days" 1 14 1200 streak-14
    next=$(next_id)
  fi
  if (( next == 8 )); then
    create_achievement "$nft" "30-Day Streak" "Run at least 1 km per day for 30 consecutive days" 1 30 2000 streak-30
    next=$(next_id)
  fi
  if (( next == 9 )); then
    create_achievement "$nft" "Double Digits Total" "Accumulate 10 km across all verified runs" 2 10000 400 total-10k
    next=$(next_id)
  fi
  if (( next == 10 )); then
    create_achievement "$nft" "Century Club" "Accumulate 100 km across all verified runs" 2 100000 1500 century
    next=$(next_id)
  fi
  echo "  nextAchievementId=$next after seeding"
  (( next >= 11 )) || { echo "ERROR: expected nextAchievementId>=11, got $next" >&2; exit 1; }
}

# ---- 1. Attestation + AchievementNFT --------------------------------------
echo "==> 1/5 MovrChainAttestation + AchievementNFT"
if [[ "${SKIP_STEP1:-0}" == "1" ]]; then
  echo "  skipping forge deploy; finishing seeds on the partial deploy"
  set_env ATTESTATION "$PARTIAL_ATTESTATION"
  set_env ACHIEVEMENT_NFT "$PARTIAL_ACHIEVEMENT_NFT"
  finish_seeds "$ACHIEVEMENT_NFT"
else
  OUT=$(forge script script/DeployAttestation.s.sol:DeployAttestation "${FORGE_FLAGS[@]}")
  echo "$OUT"
  BF=broadcast/DeployAttestation.s.sol/10143/run-latest.json
  set_env ATTESTATION      "$(pick "$OUT" ATTESTATION      "$BF" MovrChainAttestation)"
  set_env ACHIEVEMENT_NFT  "$(pick "$OUT" ACHIEVEMENT_NFT  "$BF" AchievementNFT)"
fi
echo

# ---- 2. Clubs stack + staking ---------------------------------------------
echo "==> 2/5 ClubMemberNFT + MovrClubRegistry + ClubBadgeNFT + MovrStaking"
OUT=$(forge script script/DeployClubs.s.sol:DeployClubs "${FORGE_FLAGS[@]}")
echo "$OUT"
BF=broadcast/DeployClubs.s.sol/10143/run-latest.json
set_env CLUB_MEMBER_NFT "$(pick "$OUT" CLUB_MEMBER_NFT "$BF" ClubMemberNFT)"
set_env CLUB_REGISTRY   "$(pick "$OUT" CLUB_REGISTRY   "$BF" MovrClubRegistry)"
set_env CLUB_BADGE_NFT  "$(pick "$OUT" CLUB_BADGE_NFT  "$BF" ClubBadgeNFT)"
set_env MOVR_STAKING    "$(pick "$OUT" MOVR_STAKING    "$BF" MovrStaking)"
set_env STAKING         "$MOVR_STAKING"
echo "  funding staking reward pool"
fund_pool "$MOVR_STAKING" "$STAKING_POOL" "fundRewards(uint256)" 300000
echo

# ---- 3. Feed ---------------------------------------------------------------
echo "==> 3/5 MovrFeed"
OUT=$(forge script script/DeployMovrFeed.s.sol:DeployMovrFeed "${FORGE_FLAGS[@]}")
echo "$OUT"
BF=broadcast/DeployMovrFeed.s.sol/10143/run-latest.json
set_env MOVR_FEED "$(pick "$OUT" MOVR_FEED "$BF" MovrFeed)"
echo

# ---- 4. Milestone reward (+ club cut) -------------------------------------
echo "==> 4/5 MovrMilestoneReward"
OUT=$(forge script script/DeployMilestoneReward.s.sol:DeployMilestoneReward "${FORGE_FLAGS[@]}")
echo "$OUT"
BF=broadcast/DeployMilestoneReward.s.sol/10143/run-latest.json
set_env MILESTONE_REWARD "$(pick "$OUT" MILESTONE_REWARD "$BF" MovrMilestoneReward)"
echo "  funding milestone reward pool"
fund_pool "$MILESTONE_REWARD" "$MILESTONE_POOL" "fund(uint256)" 300000
echo

# ---- 5. Club challenges ----------------------------------------------------
echo "==> 5/5 MovrClubChallenges"
OUT=$(forge script script/DeployClubChallenges.s.sol:DeployClubChallenges "${FORGE_FLAGS[@]}")
echo "$OUT"
BF=broadcast/DeployClubChallenges.s.sol/10143/run-latest.json
set_env CLUB_CHALLENGES "$(pick "$OUT" CLUB_CHALLENGES "$BF" MovrClubChallenges)"
echo

# ---- Frontend env ----------------------------------------------------------
FE=../.env.local
cat > "$FE" <<EOF
# Auto-generated by contracts/redeploy-all.sh — Monad testnet (10143)
VITE_CONTRACT_ADDRESS=$ATTESTATION
VITE_PROFILE_ADDRESS=${MOVR_PROFILE:-}
VITE_MOVR_TOKEN=$MOVR_TOKEN
VITE_ACHIEVEMENT_NFT=$ACHIEVEMENT_NFT
VITE_STAKING=$STAKING
VITE_CLUB_REGISTRY=$CLUB_REGISTRY
VITE_CLUB_MEMBER_NFT=$CLUB_MEMBER_NFT
VITE_CLUB_BADGE_NFT=$CLUB_BADGE_NFT
VITE_CLUB_CHALLENGES=$CLUB_CHALLENGES
VITE_MILESTONE_REWARD=$MILESTONE_REWARD
VITE_FEED_ADDRESS=$MOVR_FEED
EOF

echo "=============================================================="
echo "Redeploy complete. New addresses written to contracts/.env and $FE"
echo "--------------------------------------------------------------"
echo "ATTESTATION      (VITE_CONTRACT_ADDRESS) = $ATTESTATION"
echo "ACHIEVEMENT_NFT  = $ACHIEVEMENT_NFT"
echo "STAKING          = $STAKING"
echo "CLUB_REGISTRY    = $CLUB_REGISTRY"
echo "CLUB_MEMBER_NFT  = $CLUB_MEMBER_NFT"
echo "CLUB_BADGE_NFT   = $CLUB_BADGE_NFT"
echo "CLUB_CHALLENGES  = $CLUB_CHALLENGES"
echo "MILESTONE_REWARD = $MILESTONE_REWARD"
echo "MOVR_FEED        = $MOVR_FEED"
echo "MOVR_TOKEN       = $MOVR_TOKEN  (kept)"
echo "MOVR_PROFILE     = ${MOVR_PROFILE:-<unset>}  (kept)"
echo "--------------------------------------------------------------"
echo "Next: run ./verify-all.sh to (re)verify every contract on MonadScan."
