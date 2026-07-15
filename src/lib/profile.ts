import { AVATARS, avatarSrc, type OnChainProfile } from "./avatars";
import { PROFILE_ADDRESS as DEFAULT_PROFILE_ADDRESS } from "./contracts";

export { AVATARS, avatarSrc };
export type { OnChainProfile };

export const PROFILE_ABI = [
  {
    type: "function",
    name: "setProfile",
    inputs: [
      { name: "handle", type: "string" },
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
      { name: "handle", type: "string" },
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
    name: "resolveHandle",
    inputs: [{ name: "handle", type: "string" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "handleOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isHandleAvailable",
    inputs: [{ name: "handle", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
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
      { name: "handle", type: "string", indexed: false },
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
export const MIN_HANDLE_LEN = 3;
export const MAX_HANDLE_LEN = 16;

/** Monad gas estimates often under-count string storage — pin a safe ceiling */
export const SET_PROFILE_GAS = 450_000n;

export const DEFAULT_PROFILE: OnChainProfile = {
  handle: "",
  name: "Runner",
  bio: "",
  avatarId: 0,
  updatedAt: 0n,
  exists: false,
};

const HANDLE_RE = /^[a-z][a-z0-9_]{2,15}$/;

/** Normalize handle for display / compare (lowercase). Empty if invalid. */
export function normalizeHandle(input: string): string | null {
  const trimmed = input.trim().replace(/^@+/, "").toLowerCase();
  if (!HANDLE_RE.test(trimmed)) return null;
  return trimmed;
}

export function validateHandleInput(input: string): string | null {
  const trimmed = input.trim().replace(/^@+/, "");
  if (trimmed.length < MIN_HANDLE_LEN) {
    return `Handle needs at least ${MIN_HANDLE_LEN} characters.`;
  }
  if (trimmed.length > MAX_HANDLE_LEN) {
    return `Handle must be ${MAX_HANDLE_LEN} characters or fewer.`;
  }
  if (!/^[a-zA-Z]/.test(trimmed)) {
    return "Handle must start with a letter.";
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed)) {
    return "Use letters, numbers, and underscores only.";
  }
  return null;
}

export function formatHandle(handle: string | undefined): string {
  const h = handle?.trim();
  if (!h) return "";
  return h.startsWith("@") ? h : `@${h}`;
}

/**
 * viem may return a named object, a tuple array, or an array-like Result.
 * Treat non-empty name / updatedAt as exists so refresh never looks blank.
 */
export function parseProfile(data: unknown): OnChainProfile {
  if (data == null) return DEFAULT_PROFILE;

  let handle = "";
  let name = "";
  let bio = "";
  let avatarId = 0;
  let updatedAt = 0n;
  let exists = false;

  if (Array.isArray(data)) {
    handle = String(data[0] ?? "");
    name = String(data[1] ?? "");
    bio = String(data[2] ?? "");
    avatarId = Number(data[3] ?? 0);
    updatedAt = toBigInt(data[4]);
    exists = Boolean(data[5]);
  } else if (typeof data === "object") {
    const d = data as Record<string, unknown>;
    const hasShape =
      "name" in d ||
      "handle" in d ||
      "exists" in d ||
      "avatarId" in d ||
      0 in d ||
      "0" in d;
    if (!hasShape) return DEFAULT_PROFILE;

    // New ABI: handle, name, bio, avatarId, updatedAt, exists
    if ("handle" in d || (Array.isArray(d) === false && "0" in d && "1" in d && "5" in d)) {
      handle = String(d.handle ?? d[0] ?? d["0"] ?? "");
      name = String(d.name ?? d[1] ?? d["1"] ?? "");
      bio = String(d.bio ?? d[2] ?? d["2"] ?? "");
      avatarId = Number(d.avatarId ?? d[3] ?? d["3"] ?? 0);
      updatedAt = toBigInt(d.updatedAt ?? d[4] ?? d["4"]);
      exists = Boolean(d.exists ?? d[5] ?? d["5"]);
    } else {
      // Legacy ABI fallback (name, bio, avatarId, updatedAt, exists)
      name = String(d.name ?? d[0] ?? d["0"] ?? "");
      bio = String(d.bio ?? d[1] ?? d["1"] ?? "");
      avatarId = Number(d.avatarId ?? d[2] ?? d["2"] ?? 0);
      updatedAt = toBigInt(d.updatedAt ?? d[3] ?? d["3"]);
      exists = Boolean(d.exists ?? d[4] ?? d["4"]);
    }
  } else {
    return DEFAULT_PROFILE;
  }

  if (!exists && (name.trim().length > 0 || handle.trim().length > 0 || updatedAt > 0n)) {
    exists = true;
  }

  return { handle, name, bio, avatarId, updatedAt, exists };
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
  if (profile?.exists && profile.handle.trim()) return formatHandle(profile.handle);
  if (fallbackAddress) return `${fallbackAddress.slice(0, 6)}…${fallbackAddress.slice(-4)}`;
  return "Runner";
}
