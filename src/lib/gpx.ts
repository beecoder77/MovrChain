export type LatLng = { lat: number; lng: number };

export type RunPoint = LatLng & {
  time: number | null;
  elevation: number | null;
  cumulativeDistance: number;
};

export type ParsedRun = {
  name: string;
  points: RunPoint[];
  totalDistanceMeters: number;
  durationSeconds: number;
  startTime: Date | null;
  bounds: [[number, number], [number, number]];
  /** True when loaded from /sample-run.gpx — cannot attest on-chain */
  isSample?: boolean;
};

const EARTH_RADIUS = 6371000;

function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

function parseCoord(el: Element, tag: string): number | null {
  const node = el.getElementsByTagName(tag)[0];
  if (!node?.textContent) return null;
  const value = parseFloat(node.textContent);
  return Number.isFinite(value) ? value : null;
}

export function parseGpx(xml: string): ParsedRun {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(
      "Couldn't read this file. Export GPX from Strava, Apple Health, or Garmin.",
    );
  }

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  if (trkpts.length < 2) {
    throw new Error(
      "This GPX has no track points. Try a file with a recorded route.",
    );
  }

  const name =
    doc.getElementsByTagName("name")[0]?.textContent?.trim() || "Run";

  let cumulative = 0;
  const points: RunPoint[] = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute("lat") ?? "");
    const lng = parseFloat(pt.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const timeText = pt.getElementsByTagName("time")[0]?.textContent;
    const time = timeText ? new Date(timeText).getTime() : null;
    const elevation = parseCoord(pt, "ele");

    if (points.length > 0) {
      cumulative += haversine(points[points.length - 1], { lat, lng });
    }

    points.push({ lat, lng, time, elevation, cumulativeDistance: cumulative });
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  if (points.length < 2) {
    throw new Error("Not enough valid coordinates in this GPX file.");
  }

  const timedPoints = points.filter((p) => p.time !== null);
  let durationSeconds = 0;
  let startTime: Date | null = null;

  if (timedPoints.length >= 2) {
    const start = timedPoints[0].time!;
    const end = timedPoints[timedPoints.length - 1].time!;
    durationSeconds = Math.max(1, Math.round((end - start) / 1000));
    startTime = new Date(start);
  } else {
    // Estimate ~5:30/km pace when timestamps missing
    durationSeconds = Math.max(
      60,
      Math.round((cumulative / 1000) * 330),
    );
  }

  const pad = 0.002;
  return {
    name,
    points,
    totalDistanceMeters: cumulative,
    durationSeconds,
    startTime,
    bounds: [
      [minLat - pad, minLng - pad],
      [maxLat + pad, maxLng + pad],
    ],
  };
}

export function downsamplePoints(
  points: RunPoint[],
  maxPoints = 800,
): RunPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}

export function formatPace(meters: number, seconds: number): string {
  if (meters < 10 || seconds < 1) return "—";
  const paceSecPerKm = seconds / (meters / 1000);
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function statsAtProgress(
  run: ParsedRun,
  progress: number,
): { distance: number; duration: number; pace: string } {
  const clamped = Math.min(1, Math.max(0, progress));
  const index = Math.min(
    run.points.length - 1,
    Math.floor(clamped * (run.points.length - 1)),
  );
  const point = run.points[index];
  const distance = point.cumulativeDistance;

  let duration: number;
  if (run.points[0].time && run.points[run.points.length - 1].time) {
    const start = run.points[0].time!;
    const pointTime = run.points[index].time ?? start;
    duration = Math.max(1, Math.round((pointTime - start) / 1000));
  } else {
    duration = Math.round(run.durationSeconds * clamped);
  }

  return {
    distance,
    duration,
    pace: formatPace(distance, duration),
  };
}
