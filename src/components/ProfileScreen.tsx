import { zeroAddress } from "viem";
import { useDisconnect, useReadContract, useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import type { AchievementDef, RunPost } from "../lib/posts";
import {
  ACHIEVEMENTS,
  computeAchievements,
  formatAddress,
  formatDistance,
  formatDuration,
  formatPace,
  getProfileStats,
} from "../lib/posts";
import {
  ACHIEVEMENT_NFT_ABI,
  claimStatus,
  isClubAchievement,
  NFT_CONTRACT,
  STAKING_ABI,
  STAKING_CONTRACT,
} from "../lib/achievements";
import {
  CLUB_BADGE_ABI,
  CLUB_BADGE_NFT,
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  formatDonateBps,
  parseClub,
} from "../lib/clubs";
import { avatarSrc, displayName, formatHandle } from "../lib/profile";
import { useRunnerProfile } from "../lib/useRunnerProfile";
import { Button, WalletChip } from "../design-system/components";

type ProfileScreenProps = {
  address: `0x${string}`;
  posts: RunPost[];
  onLogRun: () => void;
  onEditProfile: () => void;
  onOpenAchievement: (achievement: AchievementDef) => void;
  onOpenClub: (clubId: bigint) => void;
  onOpenClubsTab: () => void;
};

function AchievementCard({
  achievement,
  status,
  onOpen,
}: {
  achievement: AchievementDef;
  status: "locked" | "claimable" | "claimed";
  onOpen: () => void;
}) {
  const label =
    status === "claimed"
      ? "Claimed"
      : status === "claimable"
        ? "Claim NFT"
        : "Locked";

  return (
    <button
      type="button"
      className={`achievement-card achievement-card--button${
        status !== "locked" ? " achievement-card--unlocked" : ""
      }${status === "claimable" ? " achievement-card--claimable" : ""}`}
      onClick={onOpen}
      aria-label={`${achievement.title}, ${label}. Open detail`}
    >
      <img
        className="achievement-card__art"
        src={achievement.image}
        alt=""
        width={48}
        height={48}
        decoding="async"
      />
      <div className="achievement-card__body">
        <h3 className="achievement-card__title">{achievement.title}</h3>
        <p className="achievement-card__desc">{achievement.description}</p>
      </div>
      <span className="achievement-card__badge">{label}</span>
    </button>
  );
}

export function ProfileScreen({
  address,
  posts,
  onLogRun,
  onEditProfile,
  onOpenAchievement,
  onOpenClub,
  onOpenClubsTab,
}: ProfileScreenProps) {
  const { disconnect } = useDisconnect();
  const { profile, isLoading } = useRunnerProfile(address);
  const clubsLive = CLUB_REGISTRY !== zeroAddress;
  const badgesLive = CLUB_BADGE_NFT !== zeroAddress;

  const stats = getProfileStats(posts);
  const localAchievements = computeAchievements(posts);
  const unlockedLocal = localAchievements.filter((a) => a.unlocked).length;
  const hasRuns = posts.length > 0;
  const name =
    isLoading && !profile.exists ? "Loading…" : displayName(profile, address);
  const handleLabel = profile.exists ? formatHandle(profile.handle) : "";

  const { data: clubIdRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: clubsLive, staleTime: 8_000 },
  });
  const myClubId = (clubIdRaw as bigint | undefined) ?? 0n;

  const { data: clubRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "getClub",
    args: myClubId > 0n ? [myClubId] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: clubsLive && myClubId > 0n },
  });
  const myClub = myClubId > 0n ? parseClub(myClubId, clubRaw) : null;

  const { data: donateBpsRaw } = useReadContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "donateBps",
    args: [address],
    chainId: monadTestnet.id,
  });
  const donateBps = Number(donateBpsRaw ?? 0);

  const runAchievements = ACHIEVEMENTS.filter((a) => !isClubAchievement(a));
  const clubAchievements = ACHIEVEMENTS.filter((a) => isClubAchievement(a));

  const claimReads = useReadContracts({
    contracts: runAchievements.flatMap((a) => [
      {
        address: NFT_CONTRACT,
        abi: ACHIEVEMENT_NFT_ABI,
        functionName: "hasClaimed" as const,
        args: [address, BigInt(a.chainId)] as const,
        chainId: monadTestnet.id,
      },
      {
        address: NFT_CONTRACT,
        abi: ACHIEVEMENT_NFT_ABI,
        functionName: "eligible" as const,
        args: [address, BigInt(a.chainId)] as const,
        chainId: monadTestnet.id,
      },
    ]),
    query: { staleTime: 8_000, refetchOnMount: "always" },
  });

  const clubBadgeReads = useReadContracts({
    contracts: clubAchievements.flatMap((a) => [
      {
        address: CLUB_BADGE_NFT,
        abi: CLUB_BADGE_ABI,
        functionName: "hasClaimed" as const,
        args: [address, a.clubBadgeId!] as const,
        chainId: monadTestnet.id,
      },
      {
        address: CLUB_BADGE_NFT,
        abi: CLUB_BADGE_ABI,
        functionName: "eligible" as const,
        args: [address, a.clubBadgeId!] as const,
        chainId: monadTestnet.id,
      },
    ]),
    query: {
      enabled: badgesLive,
      staleTime: 8_000,
      refetchOnMount: "always",
    },
  });

  const claimedRun = runAchievements.filter((_, i) => {
    const row = claimReads.data?.[i * 2];
    return row?.status === "success" && Boolean(row.result);
  }).length;
  const claimedClub = clubAchievements.filter((_, i) => {
    const row = clubBadgeReads.data?.[i * 2];
    return row?.status === "success" && Boolean(row.result);
  }).length;
  const claimedCount = claimedRun + claimedClub;

  return (
    <section className="profile-screen" aria-labelledby="profile-heading">
      <header className="profile-screen__header">
        <h1 id="profile-heading" className="profile-screen__heading">
          Profile
        </h1>
        <WalletChip address={address} connected />
      </header>

      <div className="profile-screen__identity">
        <img
          className="profile-screen__avatar-img"
          src={avatarSrc(profile.exists ? profile.avatarId : 0)}
          alt=""
          width={64}
          height={64}
        />
        <div className="profile-screen__identity-meta">
          <p className="profile-screen__name">{name}</p>
          {handleLabel ? (
            <p className="profile-screen__handle">{handleLabel}</p>
          ) : null}
          <p className="profile-screen__address">{formatAddress(address)}</p>
          {profile.exists && profile.bio ? (
            <p className="profile-screen__bio">{profile.bio}</p>
          ) : (
            <p className="profile-screen__bio profile-screen__bio--empty">
              {isLoading
                ? "Loading profile from Monad…"
                : "Add a bio so the feed knows who\u2019s logging miles."}
            </p>
          )}
        </div>
      </div>

      <Button variant="secondary" block onClick={onEditProfile}>
        {profile.exists ? "Edit profile" : "Set up profile"}
      </Button>

      {!hasRuns && (
        <div className="profile-screen__empty">
          <p className="profile-screen__empty-title">No verified runs yet</p>
          <p className="profile-screen__empty-body">
            Log a GPX to unlock stats and achievements on your profile.
          </p>
        </div>
      )}

      <div className="profile-screen__stats" aria-label="Lifetime stats">
        <div className="profile-stat">
          <span className="profile-stat__value">{stats.runCount}</span>
          <span className="profile-stat__label">Runs</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">
            {formatDistance(stats.totalKm * 1000)}
          </span>
          <span className="profile-stat__label">Total km</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">
            {stats.bestPaceSecPerKm
              ? formatPace(1000, stats.bestPaceSecPerKm)
              : "—"}
          </span>
          <span className="profile-stat__label">Best pace</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">
            {formatDuration(stats.totalTime)}
          </span>
          <span className="profile-stat__label">Moving time</span>
        </div>
      </div>

      <section
        className="profile-screen__club"
        aria-labelledby="club-heading"
      >
        <div className="profile-screen__section-head">
          <h2 id="club-heading" className="profile-screen__section-title">
            Club
          </h2>
          <span className="profile-screen__section-meta">
            {donateBps > 0
              ? `${formatDonateBps(donateBps)} yield donate`
              : "No yield donate"}
          </span>
        </div>
        {myClub ? (
          <button
            type="button"
            className="staking-card"
            onClick={() => onOpenClub(myClub.clubId)}
            aria-label={`Open club ${myClub.name}`}
          >
            <div className="staking-card__row">
              <span className="staking-card__label">{myClub.name}</span>
              <span className="staking-card__value">
                {myClub.memberCount}/10
              </span>
            </div>
            <div className="staking-card__cta">Treasury & voting</div>
          </button>
        ) : (
          <button
            type="button"
            className="staking-card"
            onClick={onOpenClubsTab}
            aria-label="Join or create a club"
          >
            <div className="staking-card__row">
              <span className="staking-card__label">No club yet</span>
            </div>
            <div className="staking-card__cta">Browse Clubs</div>
          </button>
        )}
      </section>

      <section
        className="profile-screen__achievements"
        aria-labelledby="achievements-heading"
      >
        <div className="profile-screen__section-head">
          <h2
            id="achievements-heading"
            className="profile-screen__section-title"
          >
            Achievements
          </h2>
          <span className="profile-screen__section-meta">
            {claimedCount}/{ACHIEVEMENTS.length} NFTs
            {unlockedLocal > claimedRun
              ? ` · ${unlockedLocal} local runs`
              : ""}
          </span>
        </div>
        <div className="profile-screen__achievement-grid">
          {runAchievements.map((a, i) => {
            const claimedRow = claimReads.data?.[i * 2];
            const eligibleRow = claimReads.data?.[i * 2 + 1];
            const claimed =
              claimedRow?.status === "success" && Boolean(claimedRow.result);
            const eligible =
              eligibleRow?.status === "success" && Boolean(eligibleRow.result);
            const status = claimStatus(claimed, eligible);
            return (
              <AchievementCard
                key={a.id}
                achievement={a}
                status={status}
                onOpen={() => onOpenAchievement(a)}
              />
            );
          })}
          {clubAchievements.map((a, i) => {
            const claimedRow = clubBadgeReads.data?.[i * 2];
            const eligibleRow = clubBadgeReads.data?.[i * 2 + 1];
            const claimed =
              claimedRow?.status === "success" && Boolean(claimedRow.result);
            const eligible =
              eligibleRow?.status === "success" && Boolean(eligibleRow.result);
            const status = claimStatus(claimed, eligible);
            return (
              <AchievementCard
                key={a.id}
                achievement={a}
                status={status}
                onOpen={() => onOpenAchievement(a)}
              />
            );
          })}
        </div>
      </section>

      <div className="profile-screen__actions">
        <Button block onClick={onLogRun}>
          {hasRuns ? "Log a new run" : "Log your first run"}
        </Button>
        <Button variant="ghost" block onClick={() => disconnect()}>
          Disconnect wallet
        </Button>
      </div>
    </section>
  );
}
