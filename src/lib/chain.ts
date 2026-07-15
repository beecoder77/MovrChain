import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import type { ParsedRun } from "./gpx";
import { ATTESTATION_ADDRESS, MILESTONE_REWARD_ADDRESS } from "./contracts";

export const MILESTONE_METERS = 1000;
/** 1 MOVR per km — matches on-chain MovrMilestoneReward.rewardPerKm */
export const REWARD_PER_KM = 1;
export const REWARD_TOKEN = "MOVR";

/** Format display label for a distance, e.g. 1500m → "+1.5 MOVR" */
export function rewardLabelForDistance(distanceMeters: number): string {
  const km = distanceMeters / MILESTONE_METERS;
  const formatted =
    Number.isInteger(km) || Math.abs(km - Math.round(km)) < 1e-9
      ? String(Math.round(km))
      : (Math.round(km * 1000) / 1000).toString();
  return `+${formatted} ${REWARD_TOKEN}`;
}

/** @deprecated use rewardLabelForDistance — flat label for copy that means rate */
export const REWARD_LABEL = `+${REWARD_PER_KM} ${REWARD_TOKEN}/km`;

export function computeRunHash(run: ParsedRun): `0x${string}` {
  const routeHash = keccak256(
    new TextEncoder().encode(
      run.points
        .filter((_, i) => i % Math.max(1, Math.floor(run.points.length / 50)) === 0)
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .join("|"),
    ),
  );

  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, uint256, string"), [
      routeHash,
      BigInt(Math.round(run.totalDistanceMeters)),
      BigInt(run.durationSeconds),
      run.name,
    ]),
  );
}

export function meetsMilestone(distanceMeters: number): boolean {
  return distanceMeters >= MILESTONE_METERS;
}

export const MOVR_CHAIN_ABI = [
  {
    type: "function",
    name: "attestRun",
    inputs: [
      { name: "runHash", type: "bytes32" },
      { name: "distanceMeters", type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "attestations",
    inputs: [{ name: "runHash", type: "bytes32" }],
    outputs: [
      { name: "runner", type: "address" },
      { name: "distanceMeters", type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "milestoneMet", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MILESTONE_METERS",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "runnerStats",
    inputs: [{ name: "runner", type: "address" }],
    outputs: [
      { name: "totalDistanceMeters", type: "uint256" },
      { name: "runCount", type: "uint256" },
      { name: "bestSingleRunMeters", type: "uint256" },
      { name: "currentStreakDays", type: "uint256" },
      { name: "longestStreakDays", type: "uint256" },
      { name: "lastRunDay", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "RunAttested",
    inputs: [
      { name: "runHash", type: "bytes32", indexed: true },
      { name: "runner", type: "address", indexed: true },
      { name: "distanceMeters", type: "uint256", indexed: false },
      { name: "milestoneMet", type: "bool", indexed: false },
    ],
  },
] as const;

/** Public attestation contract; optional VITE_CONTRACT_ADDRESS overrides */
export const CONTRACT_ADDRESS = ATTESTATION_ADDRESS;

export const MILESTONE_REWARD_ABI = [
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "runHash", type: "bytes32" }],
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimable",
    inputs: [
      { name: "runHash", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimed",
    inputs: [{ name: "runHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rewardPerKm",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "previewReward",
    inputs: [
      { name: "runHash", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const REWARD_CONTRACT_ADDRESS = MILESTONE_REWARD_ADDRESS;
