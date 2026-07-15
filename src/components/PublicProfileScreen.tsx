import { useReadContracts } from "wagmi";
import { monadTestnet } from "viem/chains";
import type { AchievementDef, RunPost } from "../lib/posts";
import {
  ACHIEVEMENTS,
  formatAddress,
  formatDistance,
  formatDuration,
  formatPace,
  getProfileStats,
} from "../lib/posts";
import {
  ACHIEVEMENT_NFT_ABI,
  claimStatus,
  NFT_CONTRACT,
} from "../lib/achievements";
import {
  avatarSrc,
  displayName,
  formatHandle,
} from "../lib/profile";
import { useRunnerProfile } from "../lib/useRunnerProfile";
import { Button } from "../design-system/components";

type PublicProfileScreenProps = {
  /** Runner being viewed — never used for writes */
  subjectAddress: `0x${string}`;
  posts: RunPost[];
  loadingPosts?: boolean;
  onBack: () => void;
  onOpenAchievement: (achievement: AchievementDef) => void;
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
        ? "In progress"
        : "Locked";

  return (
    <button
      type="button"
      className={`achievement-card achievement-card--button${
        status === "claimed" ? " achievement-card--unlocked" : ""
      }`}
      onClick={onOpen}
      aria-label={`${achievement.title}, ${label}. View detail`}
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

/**
 * Read-only profile of another runner.
 * No edit, staking, or claim actions — subjectAddress is display/query only.
 */
export function PublicProfileScreen({
  subjectAddress,
  posts,
  loadingPosts,
  onBack,
  onOpenAchievement,
}: PublicProfileScreenProps) {
  const { profile, isLoading } = useRunnerProfile(subjectAddress);
  const stats = getProfileStats(posts);
  const hasRuns = posts.length > 0;
  const name =
    isLoading && !profile.exists
      ? "Loading…"
      : displayName(profile, subjectAddress);
  const handleLabel = profile.exists ? formatHandle(profile.handle) : "";

  const claimReads = useReadContracts({
    contracts: ACHIEVEMENTS.flatMap((a) => [
      {
        address: NFT_CONTRACT,
        abi: ACHIEVEMENT_NFT_ABI,
        functionName: "hasClaimed" as const,
        args: [subjectAddress, BigInt(a.chainId)] as const,
        chainId: monadTestnet.id,
      },
      {
        address: NFT_CONTRACT,
        abi: ACHIEVEMENT_NFT_ABI,
        functionName: "eligible" as const,
        args: [subjectAddress, BigInt(a.chainId)] as const,
        chainId: monadTestnet.id,
      },
    ]),
    query: { staleTime: 8_000, refetchOnMount: "always" },
  });

  const claimedCount = ACHIEVEMENTS.filter((_, i) => {
    const row = claimReads.data?.[i * 2];
    return row?.status === "success" && Boolean(row.result);
  }).length;

  return (
    <section className="profile-screen public-profile" aria-labelledby="public-profile-heading">
      <header className="profile-screen__header public-profile__header">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <h1 id="public-profile-heading" className="profile-screen__heading">
          Runner
        </h1>
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
          <p className="profile-screen__address">{formatAddress(subjectAddress)}</p>
          {profile.exists && profile.bio ? (
            <p className="profile-screen__bio">{profile.bio}</p>
          ) : (
            <p className="profile-screen__bio profile-screen__bio--empty">
              {isLoading ? "Loading profile from Monad…" : "No bio yet."}
            </p>
          )}
        </div>
      </div>

      {!hasRuns && !loadingPosts && (
        <div className="profile-screen__empty">
          <p className="profile-screen__empty-title">No public runs yet</p>
          <p className="profile-screen__empty-body">
            This runner hasn&apos;t published verified runs to the community feed.
          </p>
        </div>
      )}

      {loadingPosts && !hasRuns && (
        <p className="profile-screen__bio profile-screen__bio--empty">
          Loading runs…
        </p>
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
        className="profile-screen__achievements"
        aria-labelledby="public-achievements-heading"
      >
        <div className="profile-screen__section-head">
          <h2
            id="public-achievements-heading"
            className="profile-screen__section-title"
          >
            Achievements
          </h2>
          <span className="profile-screen__section-meta">
            {claimedCount}/{ACHIEVEMENTS.length} NFTs
          </span>
        </div>
        <div className="profile-screen__achievement-grid">
          {ACHIEVEMENTS.map((a, i) => {
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
        </div>
      </section>
    </section>
  );
}
