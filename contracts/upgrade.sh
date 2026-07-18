#!/usr/bin/env bash
# Upgrade Movr UUPS proxies / ClubTreasury beacon on Monad testnet.
#
# Usage:
#   ./upgrade.sh list
#   ./upgrade.sh impl <name>              # deploy new implementation only
#   ./upgrade.sh schedule <name|all>      # deploy impl (if needed) + Multisig→Timelock schedule
#   ./upgrade.sh execute <name|all>       # execute Timelock op after delay
#   ./upgrade.sh upgrade <name|all>       # alias for schedule (impl + propose)
#   ./upgrade.sh direct <name>            # hackathon shortcut: deployer owns target
#
# Names:
#   treasury | beacon | attestation | achievements | member-nft | badge-nft
#   registry | staking | feed | milestone | challenges
#
# Requires contracts/.env:
#   PRIVATE_KEY
#   For schedule/execute: MOVR_MULTISIG, TIMELOCK, plus each target address
#   For treasury: TREASURY_BEACON
#
# Optional:
#   RPC_URL, NEW_IMPLEMENTATION (skip forge create), SALT, EXECUTE_AFTER_DELAY
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then echo "Missing contracts/.env"; exit 1; fi
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${PRIVATE_KEY:-}" ]]; then echo "Set PRIVATE_KEY in contracts/.env"; exit 1; fi
if [[ "$PRIVATE_KEY" != 0x* && "$PRIVATE_KEY" != 0X* ]]; then PRIVATE_KEY="0x${PRIVATE_KEY}"; fi
export PRIVATE_KEY

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
FORGE_FLAGS=(--rpc-url "$RPC" --broadcast --slow --legacy --timeout 120 --gas-estimate-multiplier 250 -vv)

ALL_NAMES=(
  treasury
  attestation
  achievements
  member-nft
  badge-nft
  registry
  staking
  feed
  milestone
  challenges
)

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

set_env() {
  python3 - "$1" "$2" <<'PY'
import sys, re, pathlib
key, val = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env")
lines = p.read_text().splitlines() if p.exists() else []
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
  echo "  .env  $1=$2" >&2
}

# Resolve: mode|target_env|impl_artifact|impl_env_key
resolve() {
  local name="$1"
  case "$name" in
    treasury|beacon)
      echo "beacon|TREASURY_BEACON|src/ClubTreasury.sol:ClubTreasury|TREASURY_IMPL"
      ;;
    attestation)
      echo "uups|ATTESTATION|src/MovrChainAttestation.sol:MovrChainAttestation|ATTESTATION_IMPL"
      ;;
    achievements)
      echo "uups|ACHIEVEMENT_NFT|src/AchievementNFT.sol:AchievementNFT|ACHIEVEMENT_NFT_IMPL"
      ;;
    member-nft)
      echo "uups|CLUB_MEMBER_NFT|src/ClubMemberNFT.sol:ClubMemberNFT|CLUB_MEMBER_NFT_IMPL"
      ;;
    badge-nft)
      echo "uups|CLUB_BADGE_NFT|src/ClubBadgeNFT.sol:ClubBadgeNFT|CLUB_BADGE_NFT_IMPL"
      ;;
    registry)
      echo "uups|CLUB_REGISTRY|src/MovrClubRegistry.sol:MovrClubRegistry|CLUB_REGISTRY_IMPL"
      ;;
    staking)
      # Prefer MOVR_STAKING; fall back to STAKING
      if [[ -n "${MOVR_STAKING:-}" ]]; then
        echo "uups|MOVR_STAKING|src/MovrStaking.sol:MovrStaking|MOVR_STAKING_IMPL"
      else
        echo "uups|STAKING|src/MovrStaking.sol:MovrStaking|STAKING_IMPL"
      fi
      ;;
    feed)
      echo "uups|MOVR_FEED|src/MovrFeed.sol:MovrFeed|MOVR_FEED_IMPL"
      ;;
    milestone)
      echo "uups|MILESTONE_REWARD|src/MovrMilestoneReward.sol:MovrMilestoneReward|MILESTONE_REWARD_IMPL"
      ;;
    challenges)
      echo "uups|CLUB_CHALLENGES|src/MovrClubChallenges.sol:MovrClubChallenges|CLUB_CHALLENGES_IMPL"
      ;;
    *)
      echo "Unknown name: $name" >&2
      usage 1
      ;;
  esac
}

target_addr() {
  local env_key="$1"
  local addr="${!env_key:-}"

  # Derive beacon from registry when TREASURY_BEACON is not in .env yet.
  if [[ "$env_key" == "TREASURY_BEACON" && ( -z "$addr" || "$addr" != 0x* ) && -n "${CLUB_REGISTRY:-}" ]]; then
    echo "→ Reading treasuryBeacon from CLUB_REGISTRY=$CLUB_REGISTRY" >&2
    addr=$(cast call "$CLUB_REGISTRY" "treasuryBeacon()(address)" --rpc-url "$RPC" 2>/dev/null | tr -d '[:space:]' || true)
    if [[ "$addr" == 0x* && "$addr" != 0x0000000000000000000000000000000000000000 ]]; then
      set_env TREASURY_BEACON "$addr"
    fi
  fi

  if [[ -z "$addr" || "$addr" != 0x* ]]; then
    echo "Missing $env_key in contracts/.env (run ./redeploy-all.sh cutover first)." >&2
    exit 1
  fi
  echo "$addr"
}

deploy_impl() {
  local name="$1"
  local meta artifact impl_key
  meta=$(resolve "$name")
  IFS='|' read -r _mode _tenv artifact impl_key <<<"$meta"

  if [[ -n "${NEW_IMPLEMENTATION:-}" ]]; then
    echo "Using NEW_IMPLEMENTATION=$NEW_IMPLEMENTATION" >&2
    set_env "$impl_key" "$NEW_IMPLEMENTATION"
    echo "$NEW_IMPLEMENTATION"
    return
  fi

  echo "→ Deploying implementation: $artifact" >&2
  local out addr
  # Foundry ≥1.x defaults to dry-run; --broadcast is required to deploy.
  out=$(forge create "$artifact" \
    --rpc-url "$RPC" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --legacy \
    --json 2>/dev/null || true)

  if [[ -n "$out" ]]; then
    addr=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("deployedTo",""))' <<<"$out" 2>/dev/null || true)
  fi

  if [[ -z "${addr:-}" || "$addr" != 0x* ]]; then
    # Fallback: parse human output
    out=$(forge create "$artifact" \
      --rpc-url "$RPC" \
      --private-key "$PRIVATE_KEY" \
      --broadcast \
      --legacy)
    addr=$(printf '%s\n' "$out" | sed -n 's/.*Deployed to: //p' | head -1 | tr -d '[:space:]')
  fi

  [[ "$addr" == 0x* ]] || { echo "Failed to deploy implementation for $name" >&2; exit 1; }
  echo "  Deployed impl: $addr" >&2
  set_env "$impl_key" "$addr"
  # stdout must be address-only — callers capture this into NEW_IMPLEMENTATION
  echo "$addr"
}

require_gov() {
  : "${MOVR_MULTISIG:?Set MOVR_MULTISIG in .env}"
  : "${TIMELOCK:?Set TIMELOCK in .env}"
}

run_timelock() {
  local mode="$1" target="$2" new_impl="$3" try_exec="${4:-0}"
  require_gov
  echo "→ Timelock path MODE=$mode TARGET=$target NEW_IMPL=$new_impl execute=$try_exec"
  TARGET="$target" \
  NEW_IMPLEMENTATION="$new_impl" \
  MODE="$mode" \
  MOVR_MULTISIG="$MOVR_MULTISIG" \
  TIMELOCK="$TIMELOCK" \
  SALT="${SALT:-0x0000000000000000000000000000000000000000000000000000000000000000}" \
  EXECUTE_AFTER_DELAY="$try_exec" \
    forge script script/UpgradeViaTimelock.s.sol:UpgradeViaTimelock \
    "${FORGE_FLAGS[@]}"
}

cmd_list() {
  echo "Upgradeable targets (from .env):"
  echo
  printf '%-14s %-8s %-14s %s\n' "NAME" "MODE" "ENV" "ADDRESS"
  printf '%-14s %-8s %-14s %s\n' "----" "----" "---" "-------"
  local name meta mode tenv artifact impl_key addr
  for name in "${ALL_NAMES[@]}"; do
    meta=$(resolve "$name")
    IFS='|' read -r mode tenv artifact impl_key <<<"$meta"
    addr="${!tenv:-}"
    printf '%-14s %-8s %-14s %s\n' "$name" "$mode" "$tenv" "${addr:-(missing)}"
  done
  echo
  echo "Governance: MOVR_MULTISIG=${MOVR_MULTISIG:-(missing)}  TIMELOCK=${TIMELOCK:-(missing)}"
}

cmd_impl() {
  local name="$1"
  local addr
  addr=$(deploy_impl "$name")
  echo
  echo "Implementation ready: $addr"
  echo "Next: ./upgrade.sh schedule $name"
}

cmd_schedule_one() {
  local name="$1"
  local meta mode tenv artifact impl_key target new_impl
  meta=$(resolve "$name")
  IFS='|' read -r mode tenv artifact impl_key <<<"$meta"
  target=$(target_addr "$tenv")

  if [[ -n "${!impl_key:-}" && -z "${NEW_IMPLEMENTATION:-}" && "${REUSE_IMPL:-0}" == "1" ]]; then
    new_impl="${!impl_key}"
    echo "Reusing $impl_key=$new_impl"
  else
    new_impl=$(deploy_impl "$name")
  fi
  # Guard: capture must be a bare address
  if [[ "$new_impl" != 0x* ]] || [[ ${#new_impl} -ne 42 ]]; then
    echo "Bad NEW_IMPLEMENTATION capture: $new_impl" >&2
    exit 1
  fi

  run_timelock "$mode" "$target" "$new_impl" 0
  echo
  echo "Scheduled $name."
  if [[ "${MULTISIG_THRESHOLD:-1}" == "1" ]]; then
    echo "  Multisig (threshold=1) already executed the schedule."
    echo "  Wait TIMELOCK_DELAY, then: ./upgrade.sh execute $name"
  else
    echo "  1) Second Multisig signer confirms + executes"
    echo "  2) Wait TIMELOCK_DELAY"
    echo "  3) ./upgrade.sh execute $name"
  fi
}

cmd_execute_one() {
  local name="$1"
  local meta mode tenv artifact impl_key target new_impl
  meta=$(resolve "$name")
  IFS='|' read -r mode tenv artifact impl_key <<<"$meta"
  target=$(target_addr "$tenv")
  new_impl="${NEW_IMPLEMENTATION:-${!impl_key:-}}"
  if [[ -z "$new_impl" || "$new_impl" != 0x* ]]; then
    echo "Set NEW_IMPLEMENTATION or $impl_key in .env (from the schedule step)." >&2
    exit 1
  fi
  run_timelock "$mode" "$target" "$new_impl" 1
}

cmd_direct_one() {
  local name="$1"
  local meta mode tenv artifact impl_key target new_impl
  meta=$(resolve "$name")
  IFS='|' read -r mode tenv artifact impl_key <<<"$meta"
  target=$(target_addr "$tenv")
  new_impl=$(deploy_impl "$name")

  echo "⚠ direct: only works if PRIVATE_KEY currently owns the beacon/proxy (pre-Timelock)."
  if [[ "$mode" == "beacon" ]]; then
    cast send "$target" "upgradeTo(address)" "$new_impl" \
      --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy
  else
    cast send "$target" "upgradeToAndCall(address,bytes)" "$new_impl" 0x \
      --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --legacy
  fi
  echo "Direct upgrade done for $name → $new_impl"
}

expand_names() {
  local arg="$1"
  if [[ "$arg" == "all" ]]; then
    local name meta tenv
    for name in "${ALL_NAMES[@]}"; do
      meta=$(resolve "$name")
      IFS='|' read -r _mode tenv _a _i <<<"$meta"
      if [[ -n "${!tenv:-}" && "${!tenv}" == 0x* ]]; then
        echo "$name"
      else
        echo "skip $name ($tenv missing)" >&2
      fi
    done
  else
    echo "$arg"
  fi
}

CMD="${1:-}"
ARG="${2:-}"

case "$CMD" in
  ""|-h|--help|help) usage 0 ;;
  list) cmd_list ;;
  impl)
    [[ -n "$ARG" ]] || usage 1
    cmd_impl "$ARG"
    ;;
  schedule|upgrade)
    [[ -n "$ARG" ]] || usage 1
    while IFS= read -r n; do
      [[ "$n" == skip* ]] && continue
      cmd_schedule_one "$n"
    done < <(expand_names "$ARG")
    ;;
  execute)
    [[ -n "$ARG" ]] || usage 1
    while IFS= read -r n; do
      [[ "$n" == skip* ]] && continue
      cmd_execute_one "$n"
    done < <(expand_names "$ARG")
    ;;
  direct)
    [[ -n "$ARG" ]] || usage 1
    [[ "$ARG" != "all" ]] || { echo "direct does not support 'all' — pick one name." >&2; exit 1; }
    cmd_direct_one "$ARG"
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    usage 1
    ;;
esac
