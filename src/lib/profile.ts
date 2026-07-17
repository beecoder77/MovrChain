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
/** Monad charges gas_limit; string SSTOREs are cold-access heavy — keep headroom. */
export const SET_PROFILE_GAS = 1_200_000n;

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

  let parsed: OnChainProfile | null = null;
  if (Array.isArray(data)) {
    parsed = parseProfileTuple(data);
  } else if (typeof data === "object") {
    parsed = parseProfileObject(data as Record<string, unknown>);
  }
  if (!parsed) return DEFAULT_PROFILE;

  const exists =
    parsed.exists ||
    parsed.name.trim().length > 0 ||
    parsed.handle.trim().length > 0 ||
    parsed.updatedAt > 0n;

  return { ...parsed, exists };
}

/** New ABI has 6 fields (handle first); legacy pre-handle ABI had 5. */
function parseProfileTuple(data: unknown[]): OnChainProfile {
  const isNew = data.length >= 6;
  const offset = isNew ? 1 : 0;
  return {
    handle: isNew ? sanitizeText(data[0]) : "",
    name: sanitizeText(data[offset]),
    bio: sanitizeText(data[offset + 1]),
    avatarId: Number(data[offset + 2] ?? 0),
    updatedAt: toBigInt(data[offset + 3]),
    exists: Boolean(data[offset + 4]),
  };
}

function parseProfileObject(d: Record<string, unknown>): OnChainProfile | null {
  // Named result from viem (getProfile returns named outputs).
  if ("handle" in d || "name" in d || "exists" in d || "avatarId" in d) {
    return {
      handle: sanitizeText(d.handle),
      name: sanitizeText(d.name),
      bio: sanitizeText(d.bio),
      avatarId: Number(d.avatarId ?? 0),
      updatedAt: toBigInt(d.updatedAt),
      exists: Boolean(d.exists),
    };
  }
  // Array-like Result with numeric keys — normalize to a tuple and reuse.
  if ("0" in d) {
    const tuple: unknown[] = [];
    for (let i = 0; i in d || String(i) in d; i += 1) {
      tuple.push(d[i] ?? d[String(i)]);
    }
    return parseProfileTuple(tuple);
  }
  return null;
}

/** Coerce ABI string field and strip null bytes from mis-decoded legacy data. */
function sanitizeText(value: unknown): string {
  if (typeof value !== "string") {
    return value == null ? "" : `${value as string | number | bigint}`;
  }
  return value.replaceAll("\u0000", "").trimEnd();
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

/** Club / roster label: @handle → display name → short address. */
export function memberDisplayLabel(
  profile: OnChainProfile | undefined,
  fallbackAddress: string,
): string {
  if (profile?.exists && profile.handle.trim()) {
    return formatHandle(profile.handle);
  }
  if (profile?.exists && profile.name.trim()) {
    return profile.name.trim();
  }
  return `${fallbackAddress.slice(0, 6)}…${fallbackAddress.slice(-4)}`;
}
