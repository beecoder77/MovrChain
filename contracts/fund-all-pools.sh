#!/usr/bin/env bash
# Top up MovrChain reward pools to at least TARGET_MOVR each (default 1_000_000).
# - Milestone: ERC20 transfer into MovrMilestoneReward (claim uses balanceOf)
# - Staking: Multisig → Timelock schedule approve + fundRewards (needs DEFAULT_ADMIN = Timelock)
#            After TIMELOCK delay, run: ./fund-all-pools.sh execute
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

: "${PRIVATE_KEY:?}"
: "${MOVR_TOKEN:?}"
: "${MILESTONE_REWARD:?}"
: "${STAKING:?}"
: "${TIMELOCK:?}"
: "${MOVR_MULTISIG:?}"

if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then
  PRIVATE_KEY="0x${PRIVATE_KEY}"
fi

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
# 1_000_000 MOVR
TARGET="${TARGET_MOVR:-1000000000000000000000000}"
SALT="${SALT:-0x00000000000000000000000000000000000000000000000000000000000000f1}"
CMD="${1:-fund}"

OWNER=$(cast wallet address --private-key "$PRIVATE_KEY")

wei() { awk '{print $1}' ; }

need_topup() {
  # args: current target → prints amount to add (0 if already enough)
  python3 -c "c,t=int('$1'),int('$2'); print(max(0,t-c))"
}

ensure_owner_balance() {
  local need="$1"
  local bal
  bal=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$OWNER" --rpc-url "$RPC" | wei)
  if python3 -c "import sys; sys.exit(0 if int('$bal') >= int('$need') else 1)"; then
    echo "Owner MOVR OK ($bal >= $need)"
    return
  fi
  local mint
  mint=$(python3 -c "print(int('$need') - int('$bal'))")
  echo "Minting $mint MOVR to owner…"
  cast send "$MOVR_TOKEN" "mint(address,uint256)" "$OWNER" "$mint" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 200000
}

fund_milestone() {
  local pool add
  pool=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | wei)
  add=$(need_topup "$pool" "$TARGET")
  echo "Milestone pool: $pool  (target $TARGET, add $add)"
  if [[ "$add" == "0" ]]; then
    echo "Milestone already ≥ target."
    return
  fi
  ensure_owner_balance "$add"
  cast send "$MOVR_TOKEN" "transfer(address,uint256)" "$MILESTONE_REWARD" "$add" \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000
  pool=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | wei)
  echo "Milestone after: $pool"
}

# Encode calldata helpers
APPROVE_DATA=$(cast calldata "approve(address,uint256)" "$STAKING" "$TARGET")
FUND_DATA=$(cast calldata "fundRewards(uint256)" "$TARGET")

schedule_staking() {
  local delay reserve bal_tl
  delay=$(cast call "$TIMELOCK" "getMinDelay()(uint256)" --rpc-url "$RPC" | wei)
  reserve=$(cast call "$STAKING" "rewardReserve()(uint256)" --rpc-url "$RPC" | wei)
  echo "Staking rewardReserve: $reserve  (target $TARGET)"
  if python3 -c "import sys; sys.exit(0 if int('$reserve') >= int('$TARGET') else 1)"; then
    echo "Staking reserve already ≥ target — skip schedule."
    return
  fi

  # Timelock must hold + approve MOVR, then fundRewards (msg.sender = Timelock)
  ensure_owner_balance "$TARGET"
  bal_tl=$(cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$TIMELOCK" --rpc-url "$RPC" | wei)
  local send_tl
  send_tl=$(need_topup "$bal_tl" "$TARGET")
  if [[ "$send_tl" != "0" ]]; then
    echo "Sending $send_tl MOVR to Timelock…"
    cast send "$MOVR_TOKEN" "transfer(address,uint256)" "$TIMELOCK" "$send_tl" \
      --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy --gas-limit 100000
  fi

  # scheduleBatch: approve(staking, TARGET) then fundRewards(TARGET)
  local targets="[$MOVR_TOKEN,$STAKING]"
  local values="[0,0]"
  # cast for scheduleBatch is awkward — use forge script
  TARGET_MOVR="$TARGET" SALT="$SALT" \
    forge script script/FundStakingViaTimelock.s.sol:FundStakingViaTimelock \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast --legacy -vvv

  echo
  echo "Staking fund scheduled. Wait ${delay}s (~$((delay / 3600))h), then:"
  echo "  ./fund-all-pools.sh execute"
}

execute_staking() {
  TARGET_MOVR="$TARGET" SALT="$SALT" EXECUTE=1 \
    forge script script/FundStakingViaTimelock.s.sol:FundStakingViaTimelock \
    --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast --legacy -vvv
  local reserve
  reserve=$(cast call "$STAKING" "rewardReserve()(uint256)" --rpc-url "$RPC" | wei)
  echo "Staking rewardReserve after: $reserve"
}

echo "=== MovrChain pool top-up (target ≥ $TARGET wei = 1e6 MOVR) ==="
echo "Owner:     $OWNER"
echo "Milestone: $MILESTONE_REWARD"
echo "Staking:   $STAKING"
echo

case "$CMD" in
  fund)
    fund_milestone
    echo
    schedule_staking
    echo
    echo "Done (milestone live; staking pending Timelock delay if scheduled)."
    ;;
  execute)
    execute_staking
    ;;
  milestone-only)
    fund_milestone
    ;;
  status)
    echo -n "owner:     "; cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$OWNER" --rpc-url "$RPC" | wei
    echo -n "milestone: "; cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$MILESTONE_REWARD" --rpc-url "$RPC" | wei
    echo -n "staking bal: "; cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$STAKING" --rpc-url "$RPC" | wei
    echo -n "staking reserve: "; cast call "$STAKING" "rewardReserve()(uint256)" --rpc-url "$RPC" | wei
    echo -n "timelock MOVR: "; cast call "$MOVR_TOKEN" "balanceOf(address)(uint256)" "$TIMELOCK" --rpc-url "$RPC" | wei
    ;;
  *)
    echo "Usage: $0 [fund|execute|milestone-only|status]"
    exit 1
    ;;
esac
