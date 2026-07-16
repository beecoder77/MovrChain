import { CLUB_CHALLENGES_ADDRESS } from "./contracts";
import { zeroAddress } from "viem";

export const CLUB_CHALLENGES = CLUB_CHALLENGES_ADDRESS;

export const CREATE_CHALLENGE_GAS = 850_000n;
export const SUBMIT_CHALLENGE_GAS = 350_000n;
export const APPROVE_CHALLENGE_GAS = 400_000n;
export const SETTLE_CHALLENGE_GAS = 550_000n;
export const SET_CLUB_ADMIN_GAS = 120_000n;

export const DurationUnit = {
  Hours: 0,
  Days: 1,
  Months: 2,
} as const;

export type DurationUnitKey = keyof typeof DurationUnit;

export const ChallengeState = {
  Active: 0,
  Settled: 1,
  Cancelled: 2,
} as const;

export const CompletionStatus = {
  None: 0,
  Pending: 1,
  Approved: 2,
  Rejected: 3,
} as const;

export type ParsedChallenge = {
  id: bigint;
  clubId: bigint;
  creator: `0x${string}`;
  rule: string;
  unit: number;
  duration: number;
  rewardPool: bigint;
  startAt: bigint;
  endAt: bigint;
  state: number;
  approvedCount: number;
};

export const CLUB_CHALLENGES_ABI = [
  {
    type: "function",
    name: "createChallenge",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "rule", type: "string" },
      { name: "unit", type: "uint8" },
      { name: "duration", type: "uint32" },
      { name: "rewardAmount", type: "uint256" },
    ],
    outputs: [{ name: "challengeId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitCompletion",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approveCompletion",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "member", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rejectCompletion",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "member", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settle",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "clubChallengeCount",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "clubChallengeAt",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getChallenge",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [
      { name: "clubId", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "rule", type: "string" },
      { name: "unit", type: "uint8" },
      { name: "duration", type: "uint32" },
      { name: "rewardPool", type: "uint256" },
      { name: "startAt", type: "uint64" },
      { name: "endAt", type: "uint64" },
      { name: "state", type: "uint8" },
      { name: "approvedCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isActive",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "completionStatus",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "member", type: "address" },
    ],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ChallengeCreated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "clubId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "rule", type: "string", indexed: false },
      { name: "unit", type: "uint8", indexed: false },
      { name: "duration", type: "uint32", indexed: false },
      { name: "rewardPool", type: "uint256", indexed: false },
      { name: "endAt", type: "uint64", indexed: false },
    ],
  },
] as const;

export function challengesLive(): boolean {
  return CLUB_CHALLENGES !== zeroAddress;
}

export function parseChallenge(id: bigint, data: unknown): ParsedChallenge | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    return {
      id,
      clubId: BigInt(data[0] ?? 0),
      creator: data[1] as `0x${string}`,
      rule: String(data[2] ?? ""),
      unit: Number(data[3] ?? 0),
      duration: Number(data[4] ?? 0),
      rewardPool: BigInt(data[5] ?? 0),
      startAt: BigInt(data[6] ?? 0),
      endAt: BigInt(data[7] ?? 0),
      state: Number(data[8] ?? 0),
      approvedCount: Number(data[9] ?? 0),
    };
  }
  const d = data as Record<string, unknown>;
  const toBigInt = (v: unknown, fallback = 0): bigint => {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" || typeof v === "string") return BigInt(v);
    return BigInt(fallback);
  };
  const toNum = (v: unknown, fallback = 0): number => {
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") return Number(v);
    return fallback;
  };
  return {
    id,
    clubId: toBigInt(d.clubId ?? d[0]),
    creator: (d.creator ?? d[1]) as `0x${string}`,
    rule: String(d.rule ?? d[2] ?? ""),
    unit: toNum(d.unit ?? d[3]),
    duration: toNum(d.duration ?? d[4]),
    rewardPool: toBigInt(d.rewardPool ?? d[5]),
    startAt: toBigInt(d.startAt ?? d[6]),
    endAt: toBigInt(d.endAt ?? d[7]),
    state: toNum(d.state ?? d[8]),
    approvedCount: toNum(d.approvedCount ?? d[9]),
  };
}

export function durationLabel(unit: number, duration: number): string {
  const u =
    unit === DurationUnit.Hours
      ? "hour"
      : unit === DurationUnit.Months
        ? "month"
        : "day";
  const plural = duration === 1 ? u : `${u}s`;
  return `${duration} ${plural}`;
}

export function timeLeftMs(endAt: bigint, nowMs = Date.now()): number {
  return Number(endAt) * 1000 - nowMs;
}

export function formatTimeLeft(endAt: bigint, nowMs = Date.now()): string {
  const ms = timeLeftMs(endAt, nowMs);
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3_600_000);
  if (h < 48) return `${h}h left`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d left`;
  return `${Math.floor(d / 30)}mo left`;
}

export function completionLabel(status: number): string {
  if (status === CompletionStatus.Pending) return "Awaiting approval";
  if (status === CompletionStatus.Approved) return "Approved";
  if (status === CompletionStatus.Rejected) return "Rejected";
  return "";
}
