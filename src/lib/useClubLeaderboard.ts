import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import { zeroAddress } from "viem";
import {
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  CLUB_TREASURY_ABI,
  parseClub,
  sortClubsByRank,
  type ClubInfo,
} from "./clubs";
import { FEED_ABI, FEED_CONTRACT_ADDRESS } from "./feed";

export type RankedClub = ClubInfo & {
  treasuryWei: bigint;
  runCount: number;
  members: `0x${string}`[];
  rank: number;
};

export function useClubLeaderboard(viewer?: `0x${string}`) {
  const deployed = CLUB_REGISTRY !== zeroAddress;

  const { data: nextIdRaw, refetch: refetchNext } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "nextClubId",
    chainId: monadTestnet.id,
    query: { enabled: deployed, staleTime: 6_000, refetchOnMount: "always" },
  });

  const nextId = (nextIdRaw as bigint | undefined) ?? 1n;
  const clubIds = useMemo(() => {
    const ids: bigint[] = [];
    for (let i = 1n; i < nextId; i++) ids.push(i);
    return ids;
  }, [nextId]);

  const clubReads = useReadContracts({
    contracts: clubIds.map((id) => ({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: "getClub" as const,
      args: [id] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: deployed && clubIds.length > 0, staleTime: 6_000 },
  });

  const clubs = useMemo(() => {
    const list: ClubInfo[] = [];
    clubIds.forEach((id, i) => {
      const row = clubReads.data?.[i];
      if (!row || row.status !== "success") return;
      const club = parseClub(id, row.result);
      if (club) list.push(club);
    });
    return list;
  }, [clubIds, clubReads.data]);

  const memberReads = useReadContracts({
    contracts: clubs.map((c) => ({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: "members" as const,
      args: [c.clubId] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: clubs.length > 0, staleTime: 8_000 },
  });

  const balanceReads = useReadContracts({
    contracts: clubs.map((c) => ({
      address: c.treasury,
      abi: CLUB_TREASURY_ABI,
      functionName: "balance" as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: clubs.length > 0, staleTime: 6_000 },
  });

  const membersByClub = useMemo(() => {
    return clubs.map((_, i) => {
      const row = memberReads.data?.[i];
      if (!row || row.status !== "success") return [] as `0x${string}`[];
      return (row.result as `0x${string}`[]) ?? [];
    });
  }, [clubs, memberReads.data]);

  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    const list: `0x${string}`[] = [];
    for (const members of membersByClub) {
      for (const m of members) {
        const key = m.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(m);
      }
    }
    return list;
  }, [membersByClub]);

  const runReads = useReadContracts({
    contracts: uniqueMembers.map((m) => ({
      address: FEED_CONTRACT_ADDRESS,
      abi: FEED_ABI,
      functionName: "getRunnerPostIds" as const,
      args: [m] as const,
      chainId: monadTestnet.id,
    })),
    query: {
      enabled: Boolean(FEED_CONTRACT_ADDRESS) && uniqueMembers.length > 0,
      staleTime: 12_000,
    },
  });

  const runsByMember = useMemo(() => {
    const map = new Map<string, number>();
    uniqueMembers.forEach((m, i) => {
      const row = runReads.data?.[i];
      const count =
        row?.status === "success"
          ? ((row.result as readonly bigint[]) ?? []).length
          : 0;
      map.set(m.toLowerCase(), count);
    });
    return map;
  }, [uniqueMembers, runReads.data]);

  const pendingReads = useReadContracts({
    contracts:
      viewer && clubs.length > 0
        ? clubs.map((c) => ({
            address: CLUB_REGISTRY,
            abi: CLUB_REGISTRY_ABI,
            functionName: "joinPending" as const,
            args: [c.clubId, viewer] as const,
            chainId: monadTestnet.id,
          }))
        : [],
    query: {
      enabled: Boolean(viewer) && clubs.length > 0,
      staleTime: 4_000,
    },
  });

  const pendingByClub = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!viewer) return map;
    clubs.forEach((c, i) => {
      const row = pendingReads.data?.[i];
      map.set(
        c.clubId.toString(),
        row?.status === "success" ? Boolean(row.result) : false,
      );
    });
    return map;
  }, [clubs, pendingReads.data, viewer]);

  const ranked: RankedClub[] = useMemo(() => {
    const enriched = clubs.map((c, i) => {
      const members = membersByClub[i] ?? [];
      const treasuryWei =
        balanceReads.data?.[i]?.status === "success"
          ? (balanceReads.data[i].result as bigint)
          : 0n;
      let runCount = 0;
      for (const m of members) {
        runCount += runsByMember.get(m.toLowerCase()) ?? 0;
      }
      return { ...c, treasuryWei, runCount, members };
    });
    const sorted = sortClubsByRank(enriched);
    return sorted.map((c, i) => ({ ...c, rank: i + 1 }));
  }, [clubs, membersByClub, balanceReads.data, runsByMember]);

  const loading =
    deployed &&
    clubIds.length > 0 &&
    (clubReads.isLoading ||
      memberReads.isLoading ||
      balanceReads.isLoading);

  const refetchAll = () => {
    void refetchNext();
    void clubReads.refetch();
    void memberReads.refetch();
    void balanceReads.refetch();
    void runReads.refetch();
    void pendingReads.refetch();
  };

  return {
    ranked,
    pendingByClub,
    loading,
    refetchAll,
  };
}
