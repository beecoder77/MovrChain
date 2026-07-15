import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { latLngBounds, point } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import type { RunPoint } from "../lib/gpx";
import "leaflet/dist/leaflet.css";

const FIT_PADDING: [number, number] = [24, 24];

type RouteMapProps = {
  points: RunPoint[];
  progress?: number;
  className?: string;
  interactive?: boolean;
};

function tightBounds(points: RunPoint[]): LatLngBoundsExpression | null {
  if (points.length < 2) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function MapViewport({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();

  useEffect(() => {
    const fitRoute = () => {
      map.invalidateSize();
      const box = latLngBounds(bounds as LatLngTuple[]);
      const pad = point(FIT_PADDING[1], FIT_PADDING[0]);
      const zoom = map.getBoundsZoom(box, false, pad);
      map.setView(box.getCenter(), zoom, { animate: false });
    };

    fitRoute();
    const timers = [0, 50, 150, 300].map((ms) =>
      window.setTimeout(fitRoute, ms),
    );
    const observer = new ResizeObserver(fitRoute);
    observer.observe(map.getContainer());

    return () => {
      timers.forEach(window.clearTimeout);
      observer.disconnect();
    };
  }, [map, bounds]);

  return null;
}

function useCssColor(varName: string, fallback: string): string {
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const probe = document.createElement("span");
    probe.style.color = `var(${varName})`;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    if (resolved && resolved !== "rgba(0, 0, 0, 0)") {
      setColor(resolved);
    }
  }, [varName]);

  return color;
}

export function RouteMap({
  points,
  progress = 1,
  className,
  interactive = true,
}: RouteMapProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const routeColor = useCssColor("--color-route-line", "#c45a1a");
  const outlineColor = useCssColor("--color-route-line-outline", "#3d2a1f");

  const clamped = Math.min(1, Math.max(0, progress));
  const endIndex = Math.max(
    1,
    Math.floor(clamped * (points.length - 1)),
  );
  const visible = points.slice(0, endIndex + 1);
  const positions = visible.map((p) => [p.lat, p.lng] as LatLngTuple);

  const routeBounds = useMemo(() => tightBounds(points), [points]);

  const markReady = useCallback(() => {
    const node = shellRef.current;
    if (node && node.offsetHeight > 0) {
      setMapReady(true);
    }
  }, []);

  useEffect(() => {
    markReady();
    const node = shellRef.current;
    if (!node) return;

    const observer = new ResizeObserver(markReady);
    observer.observe(node);
    return () => observer.disconnect();
  }, [markReady]);

  if (points.length < 2 || !routeBounds) {
    return (
      <div className={className} style={{ background: "var(--color-surface)" }} />
    );
  }

  return (
    <div
      ref={shellRef}
      className={className}
      style={{ height: "100%", width: "100%", minHeight: "var(--map-min-height)" }}
    >
      {mapReady ? (
        <MapContainer
          bounds={routeBounds}
          boundsOptions={{ padding: FIT_PADDING, animate: false }}
          scrollWheelZoom={interactive}
          dragging={interactive}
          zoomControl={interactive}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapViewport bounds={routeBounds} />
          {/* Soft outline so the route stays readable on light/dark tiles */}
          <Polyline
            positions={positions}
            pathOptions={{
              color: outlineColor,
              weight: 7,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <Polyline
            positions={positions}
            pathOptions={{
              color: routeColor,
              weight: 4,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </MapContainer>
      ) : null}
    </div>
  );
}
