import type { RunPost } from "../lib/posts";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatTimeAgo,
} from "../lib/posts";
import { avatarSrc, displayName, type OnChainProfile } from "../lib/profile";
import { rewardLabelForDistance } from "../lib/chain";
import { getRoutePoints, toMapPoints } from "../lib/routes";
import { RouteMap } from "./RouteMap";

type TimelinePostProps = {
  post: RunPost;
  isOwn?: boolean;
  profile?: OnChainProfile;
  onOpen?: (post: RunPost) => void;
  /** Open this runner's public profile (avatar / name). */
  onOpenProfile?: (address: `0x${string}`) => void;
};

export function TimelinePost({
  post,
  isOwn,
  profile,
  onOpen,
  onOpenProfile,
}: TimelinePostProps) {
  let runnerLabel: string;
  if (isOwn) {
    runnerLabel =
      profile?.exists && profile.name.trim()
        ? profile.name.trim()
        : "You";
  } else {
    runnerLabel = displayName(profile, post.address);
  }

  const imgSrc = avatarSrc(profile?.exists ? profile.avatarId : 0);
  const route = getRoutePoints(post.runHash);
  const mapPoints = route.length >= 2 ? toMapPoints(route) : [];
  const interactive = Boolean(onOpen);

  const identityInner = (
    <>
      <img
        className="timeline-post__avatar-img"
        src={imgSrc}
        alt=""
        width={36}
        height={36}
      />
      <div className="timeline-post__meta">
        <span className="timeline-post__runner">{runnerLabel}</span>
        <time className="timeline-post__time" dateTime={post.verifiedAt}>
          {formatTimeAgo(post.verifiedAt) || "Recently"}
        </time>
      </div>
    </>
  );

  const runBody = (
    <>
      {mapPoints.length >= 2 && (
        <div className="timeline-post__map" aria-hidden={!interactive}>
          <RouteMap points={mapPoints} progress={1} interactive={false} />
        </div>
      )}

      <h3 className="timeline-post__title">{post.runName}</h3>

      <dl className="timeline-post__stats">
        <div className="timeline-post__stat timeline-post__stat--primary">
          <dt className="timeline-post__stat-label">Distance</dt>
          <dd className="timeline-post__stat-value">
            {formatDistance(post.distanceMeters)}
            <span className="timeline-post__stat-unit"> km</span>
          </dd>
        </div>
        <div className="timeline-post__stat">
          <dt className="timeline-post__stat-label">Pace /km</dt>
          <dd className="timeline-post__stat-value">
            {formatPace(post.distanceMeters, post.durationSeconds)}
          </dd>
        </div>
        <div className="timeline-post__stat">
          <dt className="timeline-post__stat-label">Time</dt>
          <dd className="timeline-post__stat-value">
            {formatDuration(post.durationSeconds)}
          </dd>
        </div>
      </dl>

      <footer className="timeline-post__footer">
        <span className="timeline-post__proof">
          {interactive ? "Tap for route detail" : "On-chain attestation"}
        </span>
        {post.milestoneMet && (
          <span className="timeline-post__reward">
            {rewardLabelForDistance(post.distanceMeters)}
          </span>
        )}
      </footer>
    </>
  );

  return (
    <article
      className={`timeline-post${interactive ? " timeline-post--clickable" : ""}`}
      aria-label={`Run: ${post.runName}`}
    >
      <header className="timeline-post__header">
        {onOpenProfile ? (
          <button
            type="button"
            className="timeline-post__identity"
            onClick={() => onOpenProfile(post.address as `0x${string}`)}
            aria-label={`Open profile: ${runnerLabel}`}
          >
            {identityInner}
          </button>
        ) : (
          <div className="timeline-post__identity timeline-post__identity--static">
            {identityInner}
          </div>
        )}
        {post.milestoneMet && (
          <span className="timeline-post__badge">Verified</span>
        )}
      </header>

      {onOpen ? (
        <button
          type="button"
          className="timeline-post__open"
          aria-label={`Open run detail: ${post.runName}`}
          onClick={() => onOpen(post)}
        >
          {runBody}
        </button>
      ) : (
        runBody
      )}
    </article>
  );
}
