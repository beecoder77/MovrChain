import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import {
  challengesLive,
  CLUB_CHALLENGES,
  CLUB_CHALLENGES_ABI,
  ChallengeState,
  parseChallenge,
  type ParsedChallenge,
} from "./clubChallenges";

export function useClubChallengeList(clubId: bigint | undefined) {
  const live = challengesLive() && clubId !== undefined && clubId > 0n;

  const { data: countRaw, refetch: refetchCount } = useReadContract({
    address: CLUB_CHALLENGES,
    abi: CLUB_CHALLENGES_ABI,
    functionName: "clubChallengeCount",
    args: clubId !== undefined ? [clubId] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: live, staleTime: 4_000, refetchOnMount: "always" },
  });

  const count = Number(countRaw ?? 0n);

  const idReads = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: CLUB_CHALLENGES,
      abi: CLUB_CHALLENGES_ABI,
      functionName: "clubChallengeAt" as const,
      args: [clubId!, BigInt(i)] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: live && count > 0, staleTime: 4_000 },
  });

  const ids = useMemo(() => {
    return (idReads.data ?? [])
      .map((row) => (row.status === "success" ? (row.result as bigint) : 0n))
      .filter((id) => id > 0n);
  }, [idReads.data]);

  const detailReads = useReadContracts({
    contracts: ids.map((id) => ({
      address: CLUB_CHALLENGES,
      abi: CLUB_CHALLENGES_ABI,
      functionName: "getChallenge" as const,
      args: [id] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: live && ids.length > 0, staleTime: 4_000 },
  });

  const challenges: ParsedChallenge[] = useMemo(() => {
    return ids
      .map((id, i) => {
        const row = detailReads.data?.[i];
        if (!row || row.status !== "success") return null;
        return parseChallenge(id, row.result);
      })
      .filter((c): c is ParsedChallenge => c !== null)
      .sort((a, b) => Number(b.id - a.id));
  }, [ids, detailReads.data]);

  const active = challenges.filter(
    (c) =>
      c.state === ChallengeState.Active &&
      Number(c.endAt) * 1000 > Date.now(),
  );

  const refetchAll = () => {
    void refetchCount();
    void idReads.refetch();
    void detailReads.refetch();
  };

  return {
    live,
    challenges,
    active,
    loading: live && (idReads.isLoading || detailReads.isLoading),
    refetchAll,
  };
}
