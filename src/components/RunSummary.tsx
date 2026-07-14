import type { ParsedRun } from "../lib/gpx";
import {
  downsamplePoints,
  formatDistance,
  formatDuration,
  formatPace,
} from "../lib/gpx";
import { Alert, Button, StatHero } from "../design-system/components";
import { RouteMap } from "./RouteMap";

type RunSummaryProps = {
  run: ParsedRun;
  onVerify: () => void;
  onCancel?: () => void;
};

export function RunSummary({ run, onVerify, onCancel }: RunSummaryProps) {
  const mapPoints = downsamplePoints(run.points);
  const isSample = Boolean(run.isSample);

  return (
    <section className="summary-screen" aria-label="Run summary">
      <div className="summary-hero">
        <StatHero
          distanceMeters={run.totalDistanceMeters}
          durationSeconds={run.durationSeconds}
        />
      </div>

      <div className="summary-map">
        <RouteMap points={mapPoints} progress={1} />
      </div>

      <dl className="summary-meta">
        <div className="summary-meta-row">
          <dt>Run name</dt>
          <dd>{run.name}</dd>
        </div>
        <div className="summary-meta-row">
          <dt>Avg pace</dt>
          <dd>{formatPace(run.totalDistanceMeters, run.durationSeconds)} /km</dd>
        </div>
        <div className="summary-meta-row">
          <dt>Total distance</dt>
          <dd>{formatDistance(run.totalDistanceMeters)} km</dd>
        </div>
        <div className="summary-meta-row">
          <dt>Moving time</dt>
          <dd>{formatDuration(run.durationSeconds)}</dd>
        </div>
        {run.startTime && (
          <div className="summary-meta-row">
            <dt>Started</dt>
            <dd>
              {run.startTime.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </dd>
          </div>
        )}
      </dl>

      <div className="summary-footer">
        {isSample && (
          <Alert>
            Sample runs are for preview only. Import your own GPX to verify on
            Monad.
          </Alert>
        )}
        <Button block onClick={onVerify} disabled={isSample}>
          Verify on Monad
        </Button>
        {onCancel && (
          <Button variant="ghost" block onClick={onCancel}>
            {isSample ? "Back to feed" : "Cancel"}
          </Button>
        )}
      </div>
    </section>
  );
}
