import { useEffect, useMemo, useState } from "react";
import type { PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { monadTestnet } from "viem/chains";
import {
  MILESTONE_REWARD_ABI,
  REWARD_CONTRACT_ADDRESS,
  REWARD_TOKEN,
} from "./chain";
import { formatMovr } from "./achievements";
import type { RunPost } from "./posts";

export type RunClaimRewards = {
  runnerAmount: bigint;
  clubAmount: bigint;
  treasury: `0x${string}` | null;
};

const claimCache = new Map<string, RunClaimRewards | null>();

function cacheKey(runHash: string): string {
  return runHash.toLowerCase();
}

/** MOVR label from wei, e.g. +0.5 MOVR */
export function clubRewardLabelFromWei(wei: bigint): string {
  if (wei === 0n) return "";
  return `+${formatMovr(wei)} ${REWARD_TOKEN}`;
}

export async function fetchRunClaimRewards(
  client: PublicClient,
  runHash: `0x${string}`,
): Promise<RunClaimRewards | null> {
  if (!REWARD_CONTRACT_ADDRESS) return null;

  const key = cacheKey(runHash);
  if (claimCache.has(key)) return claimCache.get(key) ?? null;

  const claimed = await client.readContract({
    address: REWARD_CONTRACT_ADDRESS,
    abi: MILESTONE_REWARD_ABI,
    functionName: "claimed",
    args: [runHash],
  });
  if (!claimed) {
    return null;
  }

  const logs = await client.getContractEvents({
    address: REWARD_CONTRACT_ADDRESS,
    abi: MILESTONE_REWARD_ABI,
    eventName: "RewardClaimed",
    args: { runHash },
    fromBlock: 0n,
    toBlock: "latest",
  });

  if (logs.length === 0) {
    return null;
  }

  const last = logs[logs.length - 1]!;
  const result: RunClaimRewards = {
    runnerAmount: last.args.runnerAmount ?? 0n,
    clubAmount: last.args.clubAmount ?? 0n,
    treasury: (last.args.treasury as `0x${string}` | undefined) ?? null,
  };
  claimCache.set(key, result);
  return result;
}

export function usePostsClubRewards(posts: RunPost[]) {
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const [rewardsByHash, setRewardsByHash] = useState<
    Record<string, RunClaimRewards | null>
  >({});

  const runHashes = useMemo(() => {
    const seen = new Set<string>();
    const hashes: `0x${string}`[] = [];
    for (const post of posts) {
      if (!post.milestoneMet) continue;
      const key = cacheKey(post.runHash);
      if (seen.has(key)) continue;
      seen.add(key);
      hashes.push(post.runHash);
    }
    return hashes;
  }, [posts]);

  const hashKey = runHashes.join(",");

  useEffect(() => {
    if (!publicClient || !REWARD_CONTRACT_ADDRESS || runHashes.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        runHashes.map(async (runHash) => {
          try {
            const rewards = await fetchRunClaimRewards(publicClient, runHash);
            return [cacheKey(runHash), rewards] as const;
          } catch {
            return [cacheKey(runHash), null] as const;
          }
        }),
      );

      if (cancelled) return;

      setRewardsByHash((prev) => {
        const next = { ...prev };
        for (const [key, value] of entries) {
          next[key] = value;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, hashKey, runHashes]);

  const getClubRewardWei = (runHash: `0x${string}`): bigint => {
    const row = rewardsByHash[cacheKey(runHash)];
    return row?.clubAmount ?? 0n;
  };

  return { getClubRewardWei, rewardsByHash };
}

export function useRunClaimRewards(
  runHash: `0x${string}` | undefined,
  milestoneMet: boolean,
) {
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const [rewards, setRewards] = useState<RunClaimRewards | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!milestoneMet || !runHash || !publicClient || !REWARD_CONTRACT_ADDRESS) {
      setRewards(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchRunClaimRewards(publicClient, runHash)
      .then((data) => {
        if (!cancelled) setRewards(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runHash, milestoneMet, publicClient]);

  return {
    rewards,
    clubRewardWei: rewards?.clubAmount ?? 0n,
    loading,
  };
}
