import type { RunPost } from "../lib/posts";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatTimeAgo,
} from "../lib/posts";
import { rewardLabelForDistance } from "../lib/chain";
import { EXPLORER_URL } from "../lib/wagmi";
import { getRoutePoints, toMapPoints } from "../lib/routes";
import { downsamplePoints, type ParsedRun } from "../lib/gpx";
import { useRunnerProfile } from "../lib/useRunnerProfile";
import { Button, LinkButton, StatHero } from "../design-system/components";
import { RouteMap } from "./RouteMap";
import { avatarSrc, displayName } from "../lib/profile";

type RunDetailScreenProps = {
  post: RunPost;
  liveRun?: ParsedRun | null;
  isOwn?: boolean;
  onBack: () => void;
};

export function RunDetailScreen({
  post,
  liveRun,
  isOwn,
  onBack,
}: RunDetailScreenProps) {
  const { profile } = useRunnerProfile(post.address as `0x${string}`);
  const stored = getRoutePoints(post.runHash);
  const mapPoints = liveRun
    ? downsamplePoints(liveRun.points, 200)
    : stored.length >= 2
      ? toMapPoints(stored)
      : [];

  const hasMap = mapPoints.length >= 2;
  const runnerLabel = isOwn
    ? profile.exists && profile.name.trim()
      ? profile.name.trim()
      : "You"
    : displayName(profile, post.address);

  return (
    <section className="detail-screen" aria-label="Run detail">
      <div className="detail-screen__hero">
        <div className="detail-screen__identity">
          <img
            className="detail-screen__avatar"
            src={avatarSrc(profile.exists ? profile.avatarId : 0)}
            alt=""
            width={40}
            height={40}
          />
          <div>
            <p className="detail-screen__runner">{runnerLabel}</p>
            <time className="detail-screen__time" dateTime={post.verifiedAt}>
              {formatTimeAgo(post.verifiedAt) || "Recently"}
            </time>
          </div>
        </div>
        <h1 className="detail-screen__title">{post.runName}</h1>
        <StatHero
          distanceMeters={post.distanceMeters}
          durationSeconds={post.durationSeconds}
        />
      </div>

      <div className="detail-screen__map" aria-label="Route map">
        {hasMap ? (
          <RouteMap points={mapPoints} progress={1} interactive />
        ) : (
          <div className="detail-screen__map-empty">
            <p className="detail-screen__map-empty-title">No route preview</p>
            <p className="detail-screen__map-empty-body">
              Map points are saved on this device when you verify. Runs from
              other wallets show stats only.
            </p>
          </div>
        )}
      </div>

      <dl className="summary-meta">
        <div className="summary-meta-row">
          <dt>Avg pace</dt>
          <dd>
            {formatPace(post.distanceMeters, post.durationSeconds)} /km
          </dd>
        </div>
        <div className="summary-meta-row">
          <dt>Distance</dt>
          <dd>{formatDistance(post.distanceMeters)} km</dd>
        </div>
        <div className="summary-meta-row">
          <dt>Moving time</dt>
          <dd>{formatDuration(post.durationSeconds)}</dd>
        </div>
        {post.milestoneMet && (
          <div className="summary-meta-row">
            <dt>MOVR reward</dt>
            <dd>{rewardLabelForDistance(post.distanceMeters)}</dd>
          </div>
        )}
        <div className="summary-meta-row">
          <dt>Run hash</dt>
          <dd className="detail-screen__hash">{post.runHash}</dd>
        </div>
      </dl>

      <div className="summary-footer">
        {post.txHash && (
          <LinkButton
            block
            href={`${EXPLORER_URL}/tx/${post.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on MonadVision
          </LinkButton>
        )}
        <Button variant="ghost" block onClick={onBack}>
          Back to feed
        </Button>
      </div>
    </section>
  );
}
