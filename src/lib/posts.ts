import type { ParsedRun } from "./gpx";
import { computeRunHash, meetsMilestone } from "./chain";
import { formatDistance, formatDuration, formatPace } from "./gpx";
import { saveRouteFromRun } from "./routes";

export type RunPost = {
  id: string;
  address: string;
  runName: string;
  distanceMeters: number;
  durationSeconds: number;
  runHash: `0x${string}`;
  verifiedAt: string;
  txHash?: string;
  milestoneMet: boolean;
  isDemo?: boolean;
};

export type AchievementCriterion =
  | "single_run_meters"
  | "total_distance_meters"
  | "streak_days"
  | "club_join"
  | "club_donate"
  | "club_pass_proposal"
  | "club_size"
  | "club_votes";

export type AchievementDef = {
  /** Matches on-chain achievementId when synced */
  id: string;
  chainId: number;
  title: string;
  description: string;
  image: string;
  criterion: AchievementCriterion;
  threshold: number;
  /** Basis points added to staking reward rate when NFT claimed */
  stakingBoostBps: number;
  /** Club badge NFT id when criterion is club_* (0–5) */
  clubBadgeId?: number;
};

export type Achievement = AchievementDef & {
  unlocked: boolean;
  unlockedAt?: string;
};

const STORAGE_KEY = "movrchain-posts-v1";

/** Seeded achievements — mirrors contracts + public/brand/achievements */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "1k",
    chainId: 1,
    title: "First Kilometer",
    description: "Complete a single verified run of at least 1 km",
    image: "/brand/achievements/1k.svg",
    criterion: "single_run_meters",
    threshold: 1000,
    stakingBoostBps: 300,
  },
  {
    id: "5k",
    chainId: 2,
    title: "First 5K",
    description: "Complete a single verified run of at least 5 km",
    image: "/brand/achievements/5k.svg",
    criterion: "single_run_meters",
    threshold: 5000,
    stakingBoostBps: 500,
  },
  {
    id: "10k",
    chainId: 3,
    title: "First 10K",
    description: "Complete a single verified run of at least 10 km",
    image: "/brand/achievements/10k.svg",
    criterion: "single_run_meters",
    threshold: 10000,
    stakingBoostBps: 800,
  },
  {
    id: "half",
    chainId: 4,
    title: "First Half Marathon",
    description: "Complete a single verified run of at least 21.0975 km",
    image: "/brand/achievements/half.svg",
    criterion: "single_run_meters",
    threshold: 21098,
    stakingBoostBps: 1200,
  },
  {
    id: "marathon",
    chainId: 5,
    title: "First Marathon",
    description: "Complete a single verified run of at least 42.195 km",
    image: "/brand/achievements/marathon.svg",
    criterion: "single_run_meters",
    threshold: 42195,
    stakingBoostBps: 2000,
  },
  {
    id: "streak-7",
    chainId: 6,
    title: "7-Day Streak",
    description: "Run at least 1 km per day for 7 consecutive days",
    image: "/brand/achievements/streak-7.svg",
    criterion: "streak_days",
    threshold: 7,
    stakingBoostBps: 700,
  },
  {
    id: "streak-14",
    chainId: 7,
    title: "14-Day Streak",
    description: "Run at least 1 km per day for 14 consecutive days",
    image: "/brand/achievements/streak-14.svg",
    criterion: "streak_days",
    threshold: 14,
    stakingBoostBps: 1200,
  },
  {
    id: "streak-30",
    chainId: 8,
    title: "30-Day Streak",
    description: "Run at least 1 km per day for 30 consecutive days",
    image: "/brand/achievements/streak-30.svg",
    criterion: "streak_days",
    threshold: 30,
    stakingBoostBps: 2000,
  },
  {
    id: "total-10k",
    chainId: 9,
    title: "Double Digits Total",
    description: "Accumulate 10 km across all verified runs",
    image: "/brand/achievements/total-10k.svg",
    criterion: "total_distance_meters",
    threshold: 10000,
    stakingBoostBps: 400,
  },
  {
    id: "century",
    chainId: 10,
    title: "Century Club",
    description: "Accumulate 100 km across all verified runs",
    image: "/brand/achievements/century.svg",
    criterion: "total_distance_meters",
    threshold: 100000,
    stakingBoostBps: 1500,
  },
  {
    id: "club-join",
    chainId: 11,
    title: "Join a Club",
    description: "Join or create a running club on Monad",
    image: "/brand/achievements/1k.svg",
    criterion: "club_join",
    threshold: 1,
    stakingBoostBps: 200,
    clubBadgeId: 0,
  },
  {
    id: "club-donatur",
    chainId: 12,
    title: "Club Donatur",
    description: "Send staking yield or MOVR into a club treasury",
    image: "/brand/achievements/total-10k.svg",
    criterion: "club_donate",
    threshold: 1,
    stakingBoostBps: 300,
    clubBadgeId: 1,
  },
  {
    id: "club-pulse-payer",
    chainId: 13,
    title: "Pulse Payer",
    description: "Pass a club treasury proposal you authored",
    image: "/brand/achievements/5k.svg",
    criterion: "club_pass_proposal",
    threshold: 1,
    stakingBoostBps: 400,
    clubBadgeId: 2,
  },
  {
    id: "club-squad-5",
    chainId: 14,
    title: "Squad of 5",
    description: "Be in a club that reaches 5 members",
    image: "/brand/achievements/streak-7.svg",
    criterion: "club_size",
    threshold: 5,
    stakingBoostBps: 500,
    clubBadgeId: 3,
  },
  {
    id: "club-full-roster",
    chainId: 15,
    title: "Full Roster",
    description: "Be in a club that hits the 10-member cap",
    image: "/brand/achievements/streak-14.svg",
    criterion: "club_size",
    threshold: 10,
    stakingBoostBps: 800,
    clubBadgeId: 4,
  },
  {
    id: "club-consensus",
    chainId: 16,
    title: "Consensus",
    description: "Cast at least 3 votes on club proposals",
    image: "/brand/achievements/streak-30.svg",
    criterion: "club_votes",
    threshold: 3,
    stakingBoostBps: 300,
    clubBadgeId: 5,
  },
];

function loadAll(): RunPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RunPost[];
  } catch {
    return [];
  }
}

function saveAll(posts: RunPost[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    return true;
  } catch {
    return false;
  }
}

export function getPostsForAddress(address: string): RunPost[] {
  const userPosts = loadAll()
    .filter((p) => p.address.toLowerCase() === address.toLowerCase())
    .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));
  return userPosts;
}

/** @deprecated Community is on-chain via MovrFeed — local cache of your runs only */
export function getFeedPosts(address: string): RunPost[] {
  return getPostsForAddress(address);
}

export function addVerifiedPost(
  address: string,
  run: ParsedRun,
  txHash?: string,
): { post: RunPost; saved: boolean } {
  const runHash = computeRunHash(run);
  const post: RunPost = {
    id: crypto.randomUUID(),
    address,
    runName: run.name.trim() || "Untitled run",
    distanceMeters: run.totalDistanceMeters,
    durationSeconds: run.durationSeconds,
    runHash,
    verifiedAt: new Date().toISOString(),
    txHash,
    milestoneMet: meetsMilestone(run.totalDistanceMeters),
  };
  saveRouteFromRun(run, runHash);
  const all = loadAll();
  // Deduplicate by runHash for this address
  const filtered = all.filter(
    (p) =>
      !(
        p.runHash.toLowerCase() === runHash.toLowerCase() &&
        p.address.toLowerCase() === address.toLowerCase()
      ),
  );
  filtered.unshift(post);
  const saved = saveAll(filtered);
  return { post, saved };
}

export function getProfileStats(posts: RunPost[]) {
  const totalMeters = posts.reduce((s, p) => s + p.distanceMeters, 0);
  const totalSeconds = posts.reduce((s, p) => s + p.durationSeconds, 0);
  const withDistance = posts.filter((p) => p.distanceMeters > 0);
  const bestPace =
    withDistance.length > 0
      ? withDistance.reduce((best, p) => {
          const pace = p.durationSeconds / (p.distanceMeters / 1000);
          return pace < best ? pace : best;
        }, Infinity)
      : null;

  return {
    runCount: posts.length,
    totalKm: totalMeters / 1000,
    totalTime: totalSeconds,
    bestPaceSecPerKm: bestPace === Infinity ? null : bestPace,
  };
}

/** UTC calendar day key YYYY-MM-DD */
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Longest streak of calendar days with ≥1 km total verified distance */
export function longestKmStreakDays(posts: RunPost[]): number {
  const byDay = new Map<string, number>();
  for (const p of posts) {
    if (p.distanceMeters < 1) continue;
    const k = dayKey(p.verifiedAt);
    byDay.set(k, (byDay.get(k) ?? 0) + p.distanceMeters);
  }
  const qualDays = [...byDay.entries()]
    .filter(([, m]) => m >= 1000)
    .map(([d]) => d)
    .sort();
  if (qualDays.length === 0) return 0;

  let best = 1;
  let cur = 1;
  for (let i = 1; i < qualDays.length; i++) {
    const prev = new Date(`${qualDays[i - 1]}T00:00:00Z`).getTime();
    const next = new Date(`${qualDays[i]}T00:00:00Z`).getTime();
    if (next - prev === 86_400_000) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

export function computeAchievements(posts: RunPost[]): Achievement[] {
  const totalMeters = posts.reduce((s, p) => s + p.distanceMeters, 0);
  const bestSingle = posts.reduce((m, p) => Math.max(m, p.distanceMeters), 0);
  const streak = longestKmStreakDays(posts);
  const firstAt = posts.length > 0 ? posts[posts.length - 1]?.verifiedAt : undefined;

  return ACHIEVEMENTS.map((def) => {
    let unlocked = false;
    if (def.criterion === "single_run_meters") unlocked = bestSingle >= def.threshold;
    else if (def.criterion === "total_distance_meters") unlocked = totalMeters >= def.threshold;
    else if (def.criterion === "streak_days") unlocked = streak >= def.threshold;
    // Club achievements are determined on-chain — keep locked for local GPX stats
    else unlocked = false;

    return {
      ...def,
      unlocked,
      unlockedAt: unlocked ? firstAt : undefined,
    };
  });
}

export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diff = Date.now() - then;
  if (diff < 0) return "Just now";

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function addressInitials(address: string): string {
  const hex = address.startsWith("0x") ? address.slice(2) : address;
  return hex.slice(0, 2).toUpperCase() || "?";
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export { formatDistance, formatDuration, formatPace };
