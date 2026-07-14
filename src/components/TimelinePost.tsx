import type { RunPost } from "../lib/posts";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatTimeAgo,
} from "../lib/posts";
import { avatarSrc, displayName, type OnChainProfile } from "../lib/profile";
import { rewardLabelForDistance } from "../lib/chain";

type TimelinePostProps = {
  post: RunPost;
  isOwn?: boolean;
  profile?: OnChainProfile;
};

export function TimelinePost({ post, isOwn, profile }: TimelinePostProps) {
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

  return (
    <article className="timeline-post" aria-label={`Run: ${post.runName}`}>
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
        <span className="timeline-post__proof">On-chain attestation</span>
        {post.milestoneMet && (
          <span className="timeline-post__reward">
            {rewardLabelForDistance(post.distanceMeters)}
          </span>
        )}
      </footer>
    </article>
  );
}
