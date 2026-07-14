import {
  formatDistance,
  formatDuration,
  formatPace,
} from "../../lib/gpx";

type StatHeroProps = {
  distanceMeters: number;
  durationSeconds: number;
  distanceLabel?: string;
  paceLabel?: string;
  durationLabel?: string;
  /** Screen readers announce distance updates (off during replay scrubbing). */
  announceUpdates?: boolean;
};

export function StatHero({
  distanceMeters,
  durationSeconds,
  distanceLabel = "Distance",
  paceLabel = "Pace /km",
  durationLabel = "Duration",
  announceUpdates = false,
}: StatHeroProps) {
  return (
    <div className="ds-stat-hero">
      <div
        className="ds-stat-hero__value"
        aria-live={announceUpdates ? "polite" : undefined}
        aria-atomic={announceUpdates ? true : undefined}
      >
        {formatDistance(distanceMeters)}
        <span className="ds-stat-hero__unit">km</span>
      </div>
      <span className="ds-stat-hero__label">{distanceLabel}</span>

      <div className="ds-stat-row">
        <div>
          <div className="ds-stat-item__value">
            {formatPace(distanceMeters, durationSeconds)}
          </div>
          <span className="ds-stat-item__label">{paceLabel}</span>
        </div>
        <div>
          <div className="ds-stat-item__value">
            {formatDuration(durationSeconds)}
          </div>
          <span className="ds-stat-item__label">{durationLabel}</span>
        </div>
      </div>
    </div>
  );
}
