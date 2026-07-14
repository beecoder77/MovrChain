import { useEffect, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import { FEED_ADDRESS } from "./contracts";
import { meetsMilestone } from "./chain";
import type { RunPost } from "./posts";

export const FEED_CONTRACT_ADDRESS = FEED_ADDRESS;

export const FEED_ABI = [
  {
    type: "function",
    name: "publish",
    inputs: [
      { name: "runHash", type: "bytes32" },
      { name: "runName", type: "string" },
    ],
    outputs: [{ name: "postId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "published",
    inputs: [{ name: "runHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "postCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPost",
    inputs: [{ name: "postId", type: "uint256" }],
    outputs: [
      { name: "runHash", type: "bytes32" },
      { name: "runner", type: "address" },
      { name: "distanceMeters", type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
      { name: "postedAt", type: "uint64" },
      { name: "runName", type: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRunnerPostIds",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestPostIds",
    inputs: [{ name: "limit", type: "uint256" }],
    outputs: [{ name: "ids", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const;

export function publishRunName(name: string): string {
  const trimmed = name.trim() || "Untitled run";
  return trimmed.length > 64 ? trimmed.slice(0, 64) : trimmed;
}

type PostTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  bigint,
  bigint,
  bigint | number,
  string,
];

function postFromChain(postId: bigint | number, raw: PostTuple): RunPost {
  const [runHash, runner, distanceMeters, durationSeconds, postedAt, runName] =
    raw;
  const meters = Number(distanceMeters);
  const ts = Number(postedAt) * 1000;
  return {
    id: `onchain-${postId}`,
    address: runner,
    runName: runName || "Untitled run",
    distanceMeters: meters,
    durationSeconds: Number(durationSeconds),
    runHash,
    verifiedAt: new Date(ts).toISOString(),
    milestoneMet: meetsMilestone(meters),
  };
}

function parsePostResult(
  postId: bigint,
  result: unknown,
): RunPost | null {
  if (!result || typeof result !== "object") return null;
  if (Array.isArray(result) && result.length >= 6) {
    return postFromChain(postId, result as unknown as PostTuple);
  }
  const o = result as {
    runHash: `0x${string}`;
    runner: `0x${string}`;
    distanceMeters: bigint;
    durationSeconds: bigint;
    postedAt: bigint;
    runName: string;
  };
  if (!o.runHash || !o.runner) return null;
  return postFromChain(postId, [
    o.runHash,
    o.runner,
    o.distanceMeters,
    o.durationSeconds,
    o.postedAt,
    o.runName,
  ]);
}

function usePostsByIds(ids: bigint[] | undefined, refreshKey = 0) {
  const contracts = useMemo(() => {
    if (!ids?.length || !FEED_CONTRACT_ADDRESS) return [];
    return ids.map((id) => ({
      address: FEED_CONTRACT_ADDRESS,
      abi: FEED_ABI,
      functionName: "getPost" as const,
      args: [id] as const,
      chainId: monadTestnet.id,
    }));
  }, [ids, refreshKey]);

  const { data, isLoading, isFetching, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      staleTime: 12_000,
    },
  });

  const posts = useMemo(() => {
    if (!ids?.length || !data) return [];
    const out: RunPost[] = [];
    for (let i = 0; i < ids.length; i++) {
      const row = data[i];
      if (!row || row.status !== "success") continue;
      const post = parsePostResult(ids[i]!, row.result);
      if (post) out.push(post);
    }
    return out;
  }, [ids, data]);

  return {
    posts,
    isLoading: Boolean(ids?.length) && (isLoading || isFetching),
    refetch,
  };
}

const COMMUNITY_LIMIT = 40n;

export function useCommunityFeed(refreshKey = 0) {
  const {
    data: idsRaw,
    isLoading: idsLoading,
    refetch: refetchIds,
  } = useReadContract({
    address: FEED_CONTRACT_ADDRESS,
    abi: FEED_ABI,
    functionName: "latestPostIds",
    args: [COMMUNITY_LIMIT],
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(FEED_CONTRACT_ADDRESS),
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  const ids = idsRaw as bigint[] | undefined;
  const { posts, isLoading: postsLoading, refetch: refetchPosts } =
    usePostsByIds(ids, refreshKey);

  useEffect(() => {
    if (refreshKey === 0) return;
    void refetchIds();
    void refetchPosts();
  }, [refreshKey, refetchIds, refetchPosts]);

  return {
    posts,
    isLoading: idsLoading || postsLoading,
    refetch: async () => {
      await refetchIds();
      await refetchPosts();
    },
  };
}

export function usePersonalFeed(
  address: `0x${string}` | undefined,
  refreshKey = 0,
) {
  const {
    data: idsRaw,
    isLoading: idsLoading,
    refetch: refetchIds,
  } = useReadContract({
    address: FEED_CONTRACT_ADDRESS,
    abi: FEED_ABI,
    functionName: "getRunnerPostIds",
    args: address ? [address] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(FEED_CONTRACT_ADDRESS && address),
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  const idsNewestFirst = useMemo(() => {
    const ids = (idsRaw as bigint[] | undefined)?.slice() ?? [];
    ids.reverse();
    return ids;
  }, [idsRaw]);

  const { posts, isLoading: postsLoading, refetch: refetchPosts } =
    usePostsByIds(idsNewestFirst, refreshKey);

  useEffect(() => {
    if (refreshKey === 0) return;
    void refetchIds();
    void refetchPosts();
  }, [refreshKey, refetchIds, refetchPosts]);

  return {
    posts,
    isLoading: idsLoading || postsLoading,
    refetch: async () => {
      await refetchIds();
      await refetchPosts();
    },
  };
}
