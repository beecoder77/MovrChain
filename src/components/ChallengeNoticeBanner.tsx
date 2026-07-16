import { useMyClubRoster } from "../lib/useClubFeed";
import { useClubChallengeList } from "../lib/useClubChallenges";
import { useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import { CLUB_REGISTRY, CLUB_REGISTRY_ABI } from "../lib/clubs";
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

export function ChallengeNoticeBanner({
  address,
  onOpenClubs,
  ctaLabel = "Open club",
}: ChallengeNoticeBannerProps) {
  const roster = useMyClubRoster(address);
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
        challengesLive() && Boolean(isManager) && active.length > 0 && roster.members.length > 0,
      staleTime: 4_000,
    },
  });

  if (!roster.inClub || !challengesLive()) return null;

  let pendingCount = 0;
  if (isManager && pendingReads.data) {
    pendingCount = pendingReads.data.filter(
      (row) =>
        row.status === "success" &&
        Number(row.result) === CompletionStatus.Pending,
    ).length;
  }

  if (active.length === 0 && pendingCount === 0) return null;

  const headline =
    pendingCount > 0
      ? `${pendingCount} completion${pendingCount === 1 ? "" : "s"} need your approval`
      : `${active.length} active club challenge${active.length === 1 ? "" : "s"}`;

  const detail = active[0]?.rule ?? "";

  return (
    <div className="challenge-notice" role="status">
      <div className="challenge-notice__body">
        <p className="challenge-notice__title">{headline}</p>
        {detail && (
          <p className="challenge-notice__detail">
            {roster.clubName ? `${roster.clubName}: ` : ""}
            {detail.length > 80 ? `${detail.slice(0, 80)}…` : detail}
          </p>
        )}
      </div>
      <button type="button" className="challenge-notice__cta" onClick={onOpenClubs}>
        {ctaLabel}
      </button>
    </div>
  );
}
