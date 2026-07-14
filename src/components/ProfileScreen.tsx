import { useDisconnect } from "wagmi";
import type { Achievement, RunPost } from "../lib/posts";
import {
  computeAchievements,
  formatAddress,
  formatDistance,
  formatDuration,
  formatPace,
  getProfileStats,
} from "../lib/posts";
import { avatarSrc, displayName } from "../lib/profile";
import { useRunnerProfile } from "../lib/useRunnerProfile";
import { Button, WalletChip } from "../design-system/components";

type ProfileScreenProps = {
  address: `0x${string}`;
  posts: RunPost[];
  onLogRun: () => void;
  onEditProfile: () => void;
};

function AchievementCard({ achievement }: { achievement: Achievement }) {
  return (
    <div
      className={`achievement-card${achievement.unlocked ? " achievement-card--unlocked" : ""}`}
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
      <span className="sr-only">
        {achievement.unlocked ? "Unlocked" : "Locked"}
      </span>
    </div>
  );
}

export function ProfileScreen({
  address,
  posts,
  onLogRun,
  onEditProfile,
}: ProfileScreenProps) {
  const { disconnect } = useDisconnect();
  const { profile, isLoading } = useRunnerProfile(address);

  const stats = getProfileStats(posts);
  const achievements = computeAchievements(posts);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const hasRuns = posts.length > 0;
  const name = isLoading && !profile.exists
    ? "Loading…"
    : displayName(profile, address);

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
          <span className="profile-stat__value">{formatDuration(stats.totalTime)}</span>
          <span className="profile-stat__label">Moving time</span>
        </div>
      </div>

      <section className="profile-screen__achievements" aria-labelledby="achievements-heading">
        <div className="profile-screen__section-head">
          <h2 id="achievements-heading" className="profile-screen__section-title">
            Achievements
          </h2>
          <span className="profile-screen__section-meta">
            {unlockedCount}/{achievements.length}
          </span>
        </div>
        <div className="profile-screen__achievement-grid">
          {achievements.map((a) => (
            <AchievementCard key={a.id} achievement={a} />
          ))}
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
