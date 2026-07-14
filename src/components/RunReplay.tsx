import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedRun } from "../lib/gpx";
import { downsamplePoints, statsAtProgress } from "../lib/gpx";
import { Button, StatHero } from "../design-system/components";
import { RouteMap } from "./RouteMap";

type RunReplayProps = {
  run: ParsedRun;
  onFinish: () => void;
};

const REPLAY_MIN_MS = 8_000;
const REPLAY_MAX_MS = 12_000;

function replayDurationMs(durationSeconds: number): number {
  return Math.min(
    Math.max(durationSeconds * 1000, REPLAY_MIN_MS),
    REPLAY_MAX_MS,
  );
}

function PlayIcon({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  );
}

export function RunReplay({ run, onFinish }: RunReplayProps) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef<number>(0);
  const progressRef = useRef(0);
  const animRef = useRef({ startTime: 0, baseProgress: 0 });
  const durationMs = replayDurationMs(run.durationSeconds);
  const mapPoints = downsamplePoints(run.points);

  const tick = useCallback(
    (now: number) => {
      if (!animRef.current.startTime) {
        animRef.current.startTime = now;
      }
      const elapsed = now - animRef.current.startTime;
      const next = Math.min(
        1,
        animRef.current.baseProgress + elapsed / durationMs,
      );
      progressRef.current = next;
      setProgress(next);
      if (next < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    },
    [durationMs],
  );

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    animRef.current = { startTime: 0, baseProgress: progressRef.current };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, tick]);

  const stats = statsAtProgress(run, progress);
  const finished = progress >= 1;

  return (
    <section className="replay-screen" aria-label="Run replay">
      <div className="replay-stats">
        <StatHero
          distanceMeters={stats.distance}
          durationSeconds={stats.duration}
        />
      </div>

      <div className="replay-map-wrap">
        <RouteMap
          points={mapPoints}
          progress={progress}
          interactive={false}
        />
      </div>

      <div className="replay-controls">
        <label htmlFor="replay-scrubber" className="sr-only">
          Scrub run progress
        </label>
        <input
          id="replay-scrubber"
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          className="replay-scrubber"
          onChange={(e) => {
            setPlaying(false);
            const next = Number(e.target.value) / 1000;
            progressRef.current = next;
            setProgress(next);
          }}
        />
        <div className="replay-actions">
          <button
            type="button"
            className="replay-play-btn"
            aria-label={playing ? "Pause replay" : "Play replay"}
            onClick={() => {
              if (finished) {
                progressRef.current = 0;
                setProgress(0);
                setPlaying(true);
                return;
              }
              setPlaying((p) => !p);
            }}
          >
            <PlayIcon paused={!playing} />
          </button>
          <Button
            variant="primary-inverted"
            className="replay-finish-btn"
            onClick={onFinish}
            disabled={!finished}
          >
            {finished ? "Continue to summary" : "Finish replay to continue"}
          </Button>
        </div>
      </div>
    </section>
  );
}
