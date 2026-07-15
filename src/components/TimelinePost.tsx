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
};

export function TimelinePost({
  post,
  isOwn,
  profile,
  onOpen,
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

  const body = (
    <>
      <header className="timeline-post__header">
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
        {post.milestoneMet && (
          <span className="timeline-post__badge">Verified</span>
        )}
      </header>

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

  if (onOpen) {
    return (
      <button
        type="button"
        className="timeline-post timeline-post--button"
        aria-label={`Open run detail: ${post.runName}`}
        onClick={() => onOpen(post)}
      >
        {body}
      </button>
    );
  }

  return (
    <article className="timeline-post" aria-label={`Run: ${post.runName}`}>
      {body}
    </article>
  );
}
