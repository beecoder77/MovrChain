import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import { zeroAddress } from "viem";
import {
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  parseClub,
} from "./clubs";

export type ClubRoster = {
  clubId: bigint;
  clubName: string;
  memberSet: Set<string>;
  inClub: boolean;
};

/** Viewer's club id, name, and member address set (lowercase). */
export function useMyClubRoster(address: `0x${string}` | undefined): ClubRoster {
  const live = CLUB_REGISTRY !== zeroAddress && Boolean(address);

  const { data: clubIdRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: address ? [address] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: live, staleTime: 12_000 },
  });

  const clubId = (clubIdRaw as bigint | undefined) ?? 0n;

  const { data: clubRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "getClub",
    args: [clubId],
    chainId: monadTestnet.id,
    query: { enabled: live && clubId > 0n, staleTime: 12_000 },
  });

  const { data: membersRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "members",
    args: [clubId],
    chainId: monadTestnet.id,
    query: { enabled: live && clubId > 0n, staleTime: 12_000 },
  });

  return useMemo(() => {
    const club = clubId > 0n ? parseClub(clubId, clubRaw) : null;
    const members = (membersRaw as `0x${string}`[] | undefined) ?? [];
    return {
      clubId,
      clubName: club?.name ?? "",
      memberSet: new Set(members.map((m) => m.toLowerCase())),
      inClub: clubId > 0n && Boolean(club?.exists),
    };
  }, [clubId, clubRaw, membersRaw]);
}

/** Map wallet → club name for feed badges (skips wallets not in a club). */
export function useClubNamesByAddress(
  addresses: readonly string[],
): Map<string, string> {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const list: `0x${string}`[] = [];
    for (const a of addresses) {
      const lower = a.toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(lower) || seen.has(lower)) continue;
      seen.add(lower);
      list.push(a as `0x${string}`);
    }
    return list;
  }, [addresses]);

  const live = CLUB_REGISTRY !== zeroAddress && unique.length > 0;

  const clubOfReads = useReadContracts({
    contracts: unique.map((account) => ({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: "clubOf" as const,
      args: [account] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: live, staleTime: 20_000 },
  });

  const clubIds = useMemo(() => {
    const ids = new Set<string>();
    const ordered: bigint[] = [];
    for (const row of clubOfReads.data ?? []) {
      if (row.status !== "success") continue;
      const id = row.result as bigint;
      if (id <= 0n) continue;
      const key = id.toString();
      if (ids.has(key)) continue;
      ids.add(key);
      ordered.push(id);
    }
    return ordered;
  }, [clubOfReads.data]);

  const clubReads = useReadContracts({
    contracts: clubIds.map((id) => ({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: "getClub" as const,
      args: [id] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: live && clubIds.length > 0, staleTime: 20_000 },
  });

  return useMemo(() => {
    const nameByClubId = new Map<string, string>();
    clubIds.forEach((id, i) => {
      const row = clubReads.data?.[i];
      if (!row || row.status !== "success") return;
      const club = parseClub(id, row.result);
      if (club?.name) nameByClubId.set(id.toString(), club.name);
    });

    const out = new Map<string, string>();
    unique.forEach((account, i) => {
      const row = clubOfReads.data?.[i];
      if (!row || row.status !== "success") return;
      const id = row.result as bigint;
      if (id <= 0n) return;
      const name = nameByClubId.get(id.toString());
      if (name) out.set(account.toLowerCase(), name);
    });
    return out;
  }, [unique, clubOfReads.data, clubIds, clubReads.data]);
}
