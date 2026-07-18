import { formatUnits, parseUnits } from "viem";
import { ACHIEVEMENT_NFT_ADDRESS, MOVR_TOKEN_ADDRESS, STAKING_ADDRESS } from "./contracts";
import type { AchievementDef } from "./posts";
import { ACHIEVEMENTS } from "./posts";

export const NFT_CONTRACT = ACHIEVEMENT_NFT_ADDRESS;
export const STAKING_CONTRACT = STAKING_ADDRESS;
export const MOVR_TOKEN = MOVR_TOKEN_ADDRESS;

/** @deprecated Prefer estimate + bufferedMonadGas; kept as last-resort floor. */
export { CLAIM_NFT_GAS_FLOOR as CLAIM_NFT_GAS } from "./monadGas";
export const STAKE_GAS = 400_000n;
export const UNSTAKE_GAS = 350_000n;
export const CLAIM_REWARD_GAS = 350_000n;
export const APPROVE_GAS = 120_000n;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

export const ACHIEVEMENT_NFT_ABI = [
  {
    type: "function",
    name: "eligible",
    inputs: [
      { name: "runner", type: "address" },
      { name: "achievementId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasClaimed",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimAchievement",
    inputs: [{ name: "achievementId", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalStakingBoostBps",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownedAchievementCount",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const STAKING_ABI = [
  {
    type: "function",
    name: "stakes",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "rewardDebt", type: "uint256" },
      { name: "lastUpdate", type: "uint256" },
      { name: "lockedRate", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingReward",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "boostBpsOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rewardPerTokenPerSecond",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalStaked",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "stake",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unstake",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "donateBps",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setDonateBps",
    inputs: [{ name: "bps", type: "uint16" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export type RunnerStats = {
  totalDistanceMeters: number;
  runCount: number;
  bestSingleRunMeters: number;
  currentStreakDays: number;
  longestStreakDays: number;
};

export type AchievementClaimStatus = "locked" | "claimable" | "claimed";

export function parseRunnerStats(data: unknown): RunnerStats {
  const empty: RunnerStats = {
    totalDistanceMeters: 0,
    runCount: 0,
    bestSingleRunMeters: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
  };
  if (!data) return empty;
  if (Array.isArray(data) && data.length >= 5) {
    return {
      totalDistanceMeters: Number(data[0]),
      runCount: Number(data[1]),
      bestSingleRunMeters: Number(data[2]),
      currentStreakDays: Number(data[3]),
      longestStreakDays: Number(data[4]),
    };
  }
  const o = data as Record<string, bigint | number>;
  return {
    totalDistanceMeters: Number(o.totalDistanceMeters ?? 0),
    runCount: Number(o.runCount ?? 0),
    bestSingleRunMeters: Number(o.bestSingleRunMeters ?? 0),
    currentStreakDays: Number(o.currentStreakDays ?? 0),
    longestStreakDays: Number(o.longestStreakDays ?? 0),
  };
}

export function isClubAchievement(def: AchievementDef): boolean {
  return def.clubBadgeId !== undefined;
}

export function progressForAchievement(
  def: AchievementDef,
  stats: RunnerStats,
  clubProgress?: number,
): { current: number; threshold: number; ratio: number } {
  let current = 0;
  if (def.criterion === "single_run_meters") current = stats.bestSingleRunMeters;
  else if (def.criterion === "total_distance_meters")
    current = stats.totalDistanceMeters;
  else if (def.criterion === "streak_days")
    // Must match on-chain `eligible` (active streak only — longest does not unlock).
    current = stats.currentStreakDays;
  else current = clubProgress ?? 0;

  const threshold = def.threshold;
  const ratio = threshold > 0 ? Math.min(1, current / threshold) : 0;
  return { current, threshold, ratio };
}

export function formatProgressValue(
  def: AchievementDef,
  value: number,
): string {
  if (def.criterion === "streak_days") return `${Math.floor(value)} days`;
  if (def.criterion === "club_votes") return `${Math.floor(value)} votes`;
  if (def.criterion === "club_size") return `${Math.floor(value)} members`;
  if (
    def.criterion === "club_join" ||
    def.criterion === "club_donate" ||
    def.criterion === "club_pass_proposal"
  ) {
    return value >= 1 ? "Done" : "Not yet";
  }
  return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} km`;
}

export function formatBoostBps(bps: number): string {
  return `+${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

/** Live rate = base × (1 + boostBps/10_000) — matches MovrStaking._liveRate. */
export function boostedRewardRate(
  rewardPerTokenPerSecond: bigint,
  boostBps: number,
): bigint {
  if (rewardPerTokenPerSecond === 0n) return 0n;
  const bps = BigInt(Math.max(0, Math.floor(boostBps)));
  return (
    rewardPerTokenPerSecond + (rewardPerTokenPerSecond * bps) / 10_000n
  );
}

/** Accrual: (amount × rate × seconds) / 1e18 — matches MovrStaking.pendingReward. */
export function stakingAccrual(
  amount: bigint,
  rate: bigint,
  seconds: bigint,
): bigint {
  if (amount === 0n || rate === 0n || seconds === 0n) return 0n;
  return (amount * rate * seconds) / 10n ** 18n;
}

export type StakingHorizonReward = {
  gross: bigint;
  kept: bigint;
  club: bigint;
};

export type StakingRewardProjection = {
  rate: bigint;
  day: StakingHorizonReward;
  month: StakingHorizonReward;
  year: StakingHorizonReward;
};

const SECONDS_PER_DAY = 86_400n;
const DAYS_PER_MONTH = 30n;
const DAYS_PER_YEAR = 365n;

function splitByDonate(
  gross: bigint,
  donateBps: number,
): StakingHorizonReward {
  const bps = Math.max(0, Math.min(10_000, Math.floor(donateBps)));
  const club = bps > 0 ? (gross * BigInt(bps)) / 10_000n : 0n;
  return { gross, kept: gross - club, club };
}

/**
 * Forward-looking stake yield for day / month / year.
 * Includes achievement + club-badge boost via `boostBps`, and club treasury
 * share via `donateBps` (claim-time donate stack).
 */
export function projectStakingRewards(args: {
  amount: bigint;
  rewardPerTokenPerSecond: bigint;
  boostBps: number;
  donateBps: number;
}): StakingRewardProjection {
  const rate = boostedRewardRate(
    args.rewardPerTokenPerSecond,
    args.boostBps,
  );
  const dayGross = stakingAccrual(args.amount, rate, SECONDS_PER_DAY);
  const monthGross = stakingAccrual(
    args.amount,
    rate,
    SECONDS_PER_DAY * DAYS_PER_MONTH,
  );
  const yearGross = stakingAccrual(
    args.amount,
    rate,
    SECONDS_PER_DAY * DAYS_PER_YEAR,
  );
  return {
    rate,
    day: splitByDonate(dayGross, args.donateBps),
    month: splitByDonate(monthGross, args.donateBps),
    year: splitByDonate(yearGross, args.donateBps),
  };
}

export function formatMovr(wei: bigint, digits = 4): string {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function parseMovrInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || Number(trimmed) < 0) return null;
  try {
    return parseUnits(trimmed, 18);
  } catch {
    return null;
  }
}

export function achievementByChainId(chainId: number): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.chainId === chainId);
}

export function claimStatus(
  claimed: boolean | undefined,
  eligible: boolean | undefined,
): AchievementClaimStatus {
  if (claimed) return "claimed";
  if (eligible) return "claimable";
  return "locked";
}
