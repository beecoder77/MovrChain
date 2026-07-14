import { AVATARS, avatarSrc, type OnChainProfile } from "./avatars";
import { PROFILE_ADDRESS as DEFAULT_PROFILE_ADDRESS } from "./contracts";

export { AVATARS, avatarSrc };
export type { OnChainProfile };

export const PROFILE_ABI = [
  {
    type: "function",
    name: "setProfile",
    inputs: [
      { name: "name", type: "string" },
      { name: "bio", type: "string" },
      { name: "avatarId", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getProfile",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "bio", type: "string" },
      { name: "avatarId", type: "uint8" },
      { name: "updatedAt", type: "uint64" },
      { name: "exists", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "AVATAR_COUNT",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ProfileUpdated",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "avatarId", type: "uint8", indexed: false },
      { name: "updatedAt", type: "uint64", indexed: false },
    ],
  },
] as const;

/** Public Monad testnet MovrProfile; optional VITE_PROFILE_ADDRESS overrides */
export const PROFILE_ADDRESS = DEFAULT_PROFILE_ADDRESS;

export const MAX_NAME_LEN = 32;
export const MAX_BIO_LEN = 160;

/** Monad gas estimates often under-count string storage — pin a safe ceiling */
export const SET_PROFILE_GAS = 400_000n;

export const DEFAULT_PROFILE: OnChainProfile = {
  name: "Runner",
  bio: "",
  avatarId: 0,
  updatedAt: 0n,
  exists: false,
};

/**
 * viem may return a named object, a tuple array, or an array-like Result.
 * Treat non-empty name / updatedAt as exists so refresh never looks blank.
 */
export function parseProfile(data: unknown): OnChainProfile {
  if (data == null) return DEFAULT_PROFILE;

  let name = "";
  let bio = "";
  let avatarId = 0;
  let updatedAt = 0n;
  let exists = false;

  if (Array.isArray(data)) {
    name = String(data[0] ?? "");
    bio = String(data[1] ?? "");
    avatarId = Number(data[2] ?? 0);
    updatedAt = toBigInt(data[3]);
    exists = Boolean(data[4]);
  } else if (typeof data === "object") {
    const d = data as Record<string, unknown>;
    const hasShape =
      "name" in d || "exists" in d || "avatarId" in d || 0 in d || "0" in d;
    if (!hasShape) return DEFAULT_PROFILE;

    name = String(d.name ?? d[0] ?? d["0"] ?? "");
    bio = String(d.bio ?? d[1] ?? d["1"] ?? "");
    avatarId = Number(d.avatarId ?? d[2] ?? d["2"] ?? 0);
    updatedAt = toBigInt(d.updatedAt ?? d[3] ?? d["3"]);
    exists = Boolean(d.exists ?? d[4] ?? d["4"]);
  } else {
    return DEFAULT_PROFILE;
  }

  if (!exists && (name.trim().length > 0 || updatedAt > 0n)) {
    exists = true;
  }

  return { name, bio, avatarId, updatedAt, exists };
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  if (typeof value === "string" && value !== "") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function displayName(
  profile: OnChainProfile | undefined,
  fallbackAddress?: string,
): string {
  if (profile?.exists && profile.name.trim()) return profile.name.trim();
  if (fallbackAddress) return `${fallbackAddress.slice(0, 6)}…${fallbackAddress.slice(-4)}`;
  return "Runner";
}
