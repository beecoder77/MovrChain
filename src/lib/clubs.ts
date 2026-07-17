import {
  CLUB_BADGE_NFT_ADDRESS,
  CLUB_MEMBER_NFT_ADDRESS,
  CLUB_REGISTRY_ADDRESS,
} from "./contracts";
import { zeroAddress } from "viem";

export const CLUB_REGISTRY = CLUB_REGISTRY_ADDRESS;
export const CLUB_MEMBER_NFT = CLUB_MEMBER_NFT_ADDRESS;
export const CLUB_BADGE_NFT = CLUB_BADGE_NFT_ADDRESS;

export const MIN_DONATE_BPS = 200;
export const MAX_DONATE_BPS = 500;

export const CREATE_CLUB_GAS = 3_200_000n;
export const ADD_MEMBER_GAS = 450_000n;
export const JOIN_CLUB_GAS = 450_000n;
export const REQUEST_JOIN_GAS = 200_000n;
export const APPROVE_JOIN_GAS = 450_000n;
export const SET_VISIBILITY_GAS = 120_000n;
/** Monad eth_estimateGas often undercounts storage (strings / vote maps) — floors are ceilings; unused is refunded. */
export const PROPOSE_GAS = 750_000n;
export const VOTE_GAS = 550_000n;
export const EXECUTE_GAS = 450_000n;
export const DONATE_GAS = 350_000n;
export const SET_DONATE_BPS_GAS = 120_000n;
/** @deprecated Prefer estimate + bufferedMonadGas; kept as last-resort floor. */
export { CLAIM_BADGE_GAS_FLOOR as CLAIM_BADGE_GAS } from "./monadGas";

const CLUB_GAS_BUFFER_BPS = 200n; // 2.00× estimate

export function bufferedClubGas(estimate: bigint, floor: bigint): bigint {
  const bumped = (estimate * CLUB_GAS_BUFFER_BPS) / 100n;
  return bumped > floor ? bumped : floor;
}

export const CLUB_REGISTRY_ABI = [
  {
    type: "function",
    name: "createClub",
    inputs: [
      { name: "name", type: "string" },
      { name: "isPublic_", type: "bool" },
    ],
    outputs: [
      { name: "clubId", type: "uint256" },
      { name: "treasury", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setClubVisibility",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "isPublic_", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "joinClub",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestJoin",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approveJoin",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rejectJoin",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addMember",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "leaveClub",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getClub",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "creator", type: "address" },
      { name: "treasury", type: "address" },
      { name: "createdAt", type: "uint64" },
      { name: "exists", type: "bool" },
      { name: "memberCount_", type: "uint256" },
      { name: "isPublic", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingApplicants",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "joinPending",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "clubOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "members",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isMember",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "memberCount",
    inputs: [{ name: "clubId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextClubId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasEverJoined",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lifetimeDonatedAllClubs",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalsPassedCount",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votesCastCount",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "clubMemberCountFor",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setClubAdmin",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
      { name: "isAdmin", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isClubManager",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "clubAdmins",
    inputs: [
      { name: "clubId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const CLUB_TREASURY_ABI = [
  {
    type: "function",
    name: "balance",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingPower",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lifetimeDonated",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "topDonors",
    inputs: [],
    outputs: [{ name: "", type: "address[3]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getProposal",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      { name: "proposer", type: "address" },
      { name: "title", type: "string" },
      { name: "reason", type: "string" },
      { name: "amount", type: "uint256" },
      { name: "yesWeight", type: "uint256" },
      { name: "noWeight", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "createdAt", type: "uint64" },
      { name: "voteCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasVoted",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingClosed",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canExecute",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "VOTING_PERIOD",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "propose",
    inputs: [
      { name: "title", type: "string" },
      { name: "reason", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vote",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "support", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "execute",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "donate",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const CLUB_BADGE_ABI = [
  {
    type: "function",
    name: "eligible",
    inputs: [
      { name: "account", type: "address" },
      { name: "badge", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasClaimed",
    inputs: [
      { name: "account", type: "address" },
      { name: "badge", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "badge", type: "uint8" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stakingBoostBps",
    inputs: [{ name: "badge", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export type ClubInfo = {
  clubId: bigint;
  name: string;
  creator: `0x${string}`;
  treasury: `0x${string}`;
  createdAt: bigint;
  exists: boolean;
  memberCount: number;
  isPublic: boolean;
};

export function parseClub(
  clubId: bigint,
  data: unknown,
): ClubInfo | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    const exists = Boolean(data[4]);
    if (!exists) return null;
    return {
      clubId,
      name: String(data[0] ?? ""),
      creator: data[1] as `0x${string}`,
      treasury: data[2] as `0x${string}`,
      createdAt: BigInt(data[3] ?? 0),
      exists: true,
      memberCount: Number(data[5] ?? 0),
      isPublic: Boolean(data[6]),
    };
  }
  const d = data as Record<string, unknown>;
  if (!d.exists && !d[4]) return null;
  return {
    clubId,
    name: String(d.name ?? d[0] ?? ""),
    creator: (d.creator ?? d[1]) as `0x${string}`,
    treasury: (d.treasury ?? d[2]) as `0x${string}`,
    createdAt: BigInt((d.createdAt as bigint | number | string) ?? d[3] ?? 0),
    exists: true,
    memberCount: Number(d.memberCount_ ?? d[5] ?? 0),
    isPublic: Boolean(d.isPublic ?? d[6]),
  };
}

/** Equal-weight treasury + run activity after normalizing to each max. */
export function rankClubScore(
  treasuryWei: bigint,
  runCount: number,
  maxTreasury: bigint,
  maxRuns: number,
): number {
  const t =
    maxTreasury > 0n
      ? Number((treasuryWei * 10_000n) / maxTreasury) / 10_000
      : 0;
  const r = maxRuns > 0 ? runCount / maxRuns : 0;
  return t + r;
}

export function sortClubsByRank<
  T extends {
    treasuryWei: bigint;
    runCount: number;
    memberCount: number;
    createdAt: bigint;
  },
>(clubs: T[]): T[] {
  let maxT = 0n;
  let maxR = 0;
  for (const c of clubs) {
    if (c.treasuryWei > maxT) maxT = c.treasuryWei;
    if (c.runCount > maxR) maxR = c.runCount;
  }
  return [...clubs].sort((a, b) => {
    const sa = rankClubScore(a.treasuryWei, a.runCount, maxT, maxR);
    const sb = rankClubScore(b.treasuryWei, b.runCount, maxT, maxR);
    if (sb !== sa) return sb - sa;
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    if (a.createdAt === b.createdAt) return 0;
    return a.createdAt > b.createdAt ? -1 : 1;
  });
}

export function formatDonateBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

export function votePowerLabel(power: number): string {
  if (power >= 3) return "Top donor · 3×";
  if (power >= 2) return "Member NFT · 2×";
  if (power >= 1) return "Member · 1×";
  return "No vote";
}

export type ClubDonorEntry = {
  address: `0x${string}`;
  lifetimeWei: bigint;
  rank: number;
  isTopDonor: boolean;
  isViewer: boolean;
};

/** Rank members by treasury lifetimeDonated (runs + staking yield + manual). */
export function buildDonationLeaderboard(
  members: readonly `0x${string}`[],
  donatedWei: readonly (bigint | undefined)[],
  topDonors: readonly `0x${string}`[],
  viewer: `0x${string}`,
): ClubDonorEntry[] {
  const topSet = new Set(
    topDonors
      .filter((a) => a && a !== zeroAddress)
      .map((a) => a.toLowerCase()),
  );
  const viewerLower = viewer.toLowerCase();

  const entries = members.map((member, i) => ({
    address: member,
    lifetimeWei: donatedWei[i] ?? 0n,
    rank: 0,
    isTopDonor: topSet.has(member.toLowerCase()),
    isViewer: member.toLowerCase() === viewerLower,
  }));

  entries.sort((a, b) => {
    if (a.lifetimeWei === b.lifetimeWei) return 0;
    return a.lifetimeWei > b.lifetimeWei ? -1 : 1;
  });

  return entries.map((entry, i) => ({ ...entry, rank: i + 1 }));
}
