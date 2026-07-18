import type { LatLng, ParsedRun, RunPoint } from "./gpx";
import { downsamplePoints } from "./gpx";
import { FEED_ADDRESS } from "./contracts";

/** Route polylines for detail maps — keyed per feed cutover like posts cache. */
const ROUTES_KEY = `movrchain-routes-v2:${FEED_ADDRESS.toLowerCase()}`;
/** Keep maps small enough for localStorage; matches RouteMap density */
const STORE_MAX_POINTS = 120;

type RouteStore = Record<string, LatLng[]>;

function loadStore(): RouteStore {
  try {
    const raw = localStorage.getItem(ROUTES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RouteStore;
  } catch {
    return {};
  }
}

function saveStore(store: RouteStore): boolean {
  try {
    localStorage.setItem(ROUTES_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function saveRouteForHash(
  runHash: `0x${string}`,
  points: RunPoint[],
): boolean {
  const sampled = downsamplePoints(points, STORE_MAX_POINTS).map((p) => ({
    lat: p.lat,
    lng: p.lng,
  }));
  if (sampled.length < 2) return false;
  const store = loadStore();
  store[runHash.toLowerCase()] = sampled;
  return saveStore(store);
}

export function saveRouteFromRun(run: ParsedRun, runHash: `0x${string}`): boolean {
  return saveRouteForHash(runHash, run.points);
}

export function getRoutePoints(runHash: string): LatLng[] {
  const store = loadStore();
  const pts = store[runHash.toLowerCase()];
  return Array.isArray(pts) ? pts : [];
}

export function hasRoute(runHash: string): boolean {
  return getRoutePoints(runHash).length >= 2;
}

/** Coerce stored LatLng into RunPoint shape for RouteMap */
export function toMapPoints(latLngs: LatLng[]): RunPoint[] {
  let cumulative = 0;
  return latLngs.map((p, i) => {
    if (i > 0) {
      const prev = latLngs[i - 1]!;
      const dLat = ((p.lat - prev.lat) * Math.PI) / 180;
      const dLng = ((p.lng - prev.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prev.lat * Math.PI) / 180) *
          Math.cos((p.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      cumulative += 2 * 6371000 * Math.asin(Math.sqrt(a));
    }
    return {
      lat: p.lat,
      lng: p.lng,
      time: null,
      elevation: null,
      cumulativeDistance: cumulative,
    };
  });
}
