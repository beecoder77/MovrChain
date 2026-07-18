import { useMyClubRoster } from "../lib/useClubFeed";
import { useClubChallengeList } from "../lib/useClubChallenges";
import { useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import { zeroAddress } from "viem";
import {
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  CLUB_TREASURY_ABI,
} from "../lib/clubs";
import {
  CompletionStatus,
  challengesLive,
  CLUB_CHALLENGES,
  CLUB_CHALLENGES_ABI,
} from "../lib/clubChallenges";

type ChallengeNoticeBannerProps = {
  address: `0x${string}`;
  onOpenClubs: () => void;
  ctaLabel?: string;
};

/** In-app notice for club challenges and active treasury proposals. */
export function ChallengeNoticeBanner({
  address,
  onOpenClubs,
  ctaLabel = "Open club",
}: ChallengeNoticeBannerProps) {
  const roster = useMyClubRoster(address);
  const treasury =
    roster.treasury && roster.treasury !== zeroAddress ? roster.treasury : undefined;
  const { active } = useClubChallengeList(
    roster.inClub ? roster.clubId : undefined,
  );

  const { data: isManager } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "isClubManager",
    args: roster.inClub ? [roster.clubId, address] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: roster.inClub },
  });

  const { data: proposalCountRaw } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "proposalCount",
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(treasury),
      staleTime: 4_000,
      refetchOnMount: "always",
    },
  });
  const proposalCount = Number(proposalCountRaw ?? 0n);
  const latestId =
    proposalCount > 0 ? BigInt(proposalCount - 1) : undefined;

  const { data: proposalRaw } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "getProposal",
    args: latestId !== undefined ? [latestId] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(treasury) && latestId !== undefined,
      staleTime: 4_000,
      refetchOnMount: "always",
    },
  });

  const { data: hasVotedRaw } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "hasVoted",
    args:
      latestId !== undefined ? [latestId, address] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(treasury) && latestId !== undefined,
      staleTime: 4_000,
    },
  });

  const { data: canExecuteRaw } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "canExecute",
    args: latestId !== undefined ? [latestId] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(treasury) && latestId !== undefined && Boolean(isManager),
      staleTime: 4_000,
    },
  });

  const pendingReads = useReadContracts({
    contracts: active.flatMap((c) =>
      roster.members.map((m) => ({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "completionStatus" as const,
        args: [c.id, m] as const,
        chainId: monadTestnet.id,
      })),
    ),
    query: {
      enabled:
        challengesLive() &&
        Boolean(isManager) &&
        active.length > 0 &&
        roster.members.length > 0,
      staleTime: 4_000,
    },
  });

  if (!roster.inClub) return null;

  let pendingCount = 0;
  if (isManager && pendingReads.data) {
    pendingCount = pendingReads.data.filter(
      (row) =>
        row.status === "success" &&
        Number(row.result) === CompletionStatus.Pending,
    ).length;
  }

  let proposalActive = false;
  let proposalTitle = "";
  if (proposalRaw) {
    if (Array.isArray(proposalRaw)) {
      proposalTitle = String(proposalRaw[1] ?? "");
      proposalActive = Number(proposalRaw[6]) === 0;
    } else {
      const p = proposalRaw as { title?: string; state?: number | bigint };
      proposalTitle = String(p.title ?? "");
      proposalActive = Number(p.state ?? -1) === 0;
    }
  }

  const needsVote = proposalActive && !hasVotedRaw;
  const readyToExecute = Boolean(isManager) && Boolean(canExecuteRaw) && proposalActive;
  const showChallenges = challengesLive() && (active.length > 0 || pendingCount > 0);

  if (!proposalActive && !showChallenges) return null;

  let headline: string;
  let detail: string;
  let resolvedCta = ctaLabel;

  if (readyToExecute) {
    headline = "Treasury proposal ready to execute";
    detail = proposalTitle;
    resolvedCta = "Open vote";
  } else if (needsVote) {
    headline = "Active treasury vote — cast your vote";
    detail = proposalTitle;
    resolvedCta = "Open vote";
  } else if (proposalActive) {
    headline = "Active treasury vote in your club";
    detail = proposalTitle;
    resolvedCta = "Open vote";
  } else if (pendingCount > 0) {
    headline = `${pendingCount} completion${pendingCount === 1 ? "" : "s"} need your approval`;
    detail = active[0]?.rule ?? "";
    resolvedCta = ctaLabel;
  } else {
    headline = `${active.length} active club challenge${active.length === 1 ? "" : "s"}`;
    detail = active[0]?.rule ?? "";
    resolvedCta = ctaLabel;
  }

  const detailLine = detail
    ? `${roster.clubName ? `${roster.clubName}: ` : ""}${
        detail.length > 80 ? `${detail.slice(0, 80)}…` : detail
      }`
    : roster.clubName;

  return (
    <div className="challenge-notice" role="status">
      <div className="challenge-notice__body">
        <p className="challenge-notice__title">{headline}</p>
        {detailLine && (
          <p className="challenge-notice__detail">{detailLine}</p>
        )}
      </div>
      <button type="button" className="challenge-notice__cta" onClick={onOpenClubs}>
        {resolvedCta}
      </button>
    </div>
  );
}
