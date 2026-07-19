"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { aktiviere3D, BASEMAP_STYLE } from "@/lib/geo/map-style";
import { prefetchFlyoverTiles } from "@/lib/geo/tile-prefetch";
import {
  baueGraphDaten,
  berechneK,
  FLYOVER_DAUER_S,
  sampleAt,
  SampleCursor,
  verarbeiteStreams,
  wrapDelta,
  type ProcessedTrack,
  type SampledState,
} from "@/lib/engine/flyover";
import { FlyoverGraph } from "./flyover-graph";
import { formatDauer, formatPace } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FlyoverStreams {
  zeitS: number[];
  lat: (number | null)[];
  lng: (number | null)[];
  ele: (number | null)[];
  hr: (number | null)[];
  paceSKm: (number | null)[];
  distanzM: (number | null)[];
}

interface FlyoverMapProps {
  streams: FlyoverStreams;
  className?: string;
  /** Hover aus dem Höhenprofil (0..1) — bewegt nur den Marker */
  hoverFortschritt?: number | null;
}

/* ------------------------------------------------------------------ */
/* Trail-Farbrampe (Pace/HR) als line-gradient-Stops                   */
/* ------------------------------------------------------------------ */

interface FarbStop {
  pos: number; // line-progress 0..1 (≈ Distanzanteil)
  farbe: string;
}

function baueFarbStops(track: ProcessedTrack, modus: "hr" | "pace"): FarbStop[] {
  const werte = track.punkte
    .map((p) => (modus === "hr" ? p.hr : p.speed))
    .filter((v): v is number => v != null && v > 0);
  if (werte.length < 10) return [{ pos: 0, farbe: "#2ee6c7" }, { pos: 1, farbe: "#2ee6c7" }];
  const sortiert = [...werte].sort((a, b) => a - b);
  const min = sortiert[Math.floor(sortiert.length * 0.05)];
  const max = sortiert[Math.floor(sortiert.length * 0.95)];
  const farbe = (v: number | null): string => {
    if (v == null || v <= 0) return "#5b6b7d";
    let f = (v - min) / Math.max(1e-6, max - min);
    f = Math.min(1, Math.max(0, f));
    // Bei Pace-Modus ist die Basis speed: schnell = heiss — passt direkt
    const hue = 160 - 140 * f;
    return `hsl(${Math.round(hue)} 85% 55%)`;
  };
  const stops: FarbStop[] = [];
  const anzahl = 40;
  for (let i = 0; i < anzahl; i++) {
    const idx = Math.floor((i / (anzahl - 1)) * (track.punkte.length - 1));
    const p = track.punkte[idx];
    stops.push({
      pos: Math.min(1, p.distCum / track.totalDistance),
      farbe: farbe(modus === "hr" ? p.hr : p.speed),
    });
  }
  // strikt aufsteigende Positionen erzwingen
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].pos <= stops[i - 1].pos) stops[i].pos = stops[i - 1].pos + 1e-5;
  }
  return stops;
}

/** Voller Gradient (Ghost) */
function ghostGradient(stops: FarbStop[]): unknown {
  const expr: unknown[] = ["interpolate", ["linear"], ["line-progress"]];
  for (const s of stops) expr.push(s.pos, s.farbe);
  return expr;
}

/** Gradient bis Fortschritt p, danach transparent (Progress-Trail) */
function progressGradient(stops: FarbStop[], p: number): unknown {
  const expr: unknown[] = ["interpolate", ["linear"], ["line-progress"]];
  const pc = Math.min(0.99995, Math.max(1e-4, p));
  let letzteFarbe = stops[0].farbe;
  for (const s of stops) {
    if (s.pos < pc) {
      expr.push(s.pos, s.farbe);
      letzteFarbe = s.farbe;
    }
  }
  expr.push(pc, letzteFarbe, pc + 1e-4, "rgba(0,0,0,0)", 1, "rgba(0,0,0,0)");
  return expr;
}

/* ------------------------------------------------------------------ */

export function FlyoverMap({ streams, className, hoverFortschritt }: FlyoverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rafRef = useRef(0);

  /* Player-Zustand (Wanduhr-gekoppelt, Refs für 60 fps ohne React) */
  const startMsRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const pauseBeginnRef = useRef<number | null>(null);
  const tVideoRef = useRef(0);
  const spieltRef = useRef(false);
  const cursorRef = useRef(new SampleCursor());
  const kamBearingRef = useRef(0);
  const kamZoomRef = useRef<number | null>(null);
  const kamPitchRef = useRef<number | null>(null);
  const letzterFrameMsRef = useRef(0);
  const hudDrosselRef = useRef(0);
  const gradDrosselRef = useRef(0);

  const [bereit, setBereit] = useState(false);
  const [ladeProzent, setLadeProzent] = useState(0);
  const [vorgeladen, setVorgeladen] = useState(false);
  const [spielt, setSpielt] = useState(false);
  const [modus, setModus] = useState<"hr" | "pace">("pace");
  const [hud, setHud] = useState<{
    zeit: string;
    km: string;
    pace: string;
    ele: number;
    hr: number | null;
  } | null>(null);

  /* ---- Preprocessing (pure Engine) ---- */
  const track = useMemo(() => verarbeiteStreams(streams), [streams]);
  const graphDaten = useMemo(() => (track ? baueGraphDaten(track) : null), [track]);
  const k = useMemo(() => (track ? berechneK(track) : 1), [track]);
  const farbStops = useMemo(
    () => (track ? baueFarbStops(track, modus) : []),
    [track, modus]
  );
  const farbStopsRef = useRef(farbStops);
  farbStopsRef.current = farbStops;

  /* Kamera-Basiswerte: Zoom an mittlere VIDEO-Geschwindigkeit gekoppelt
     (Tile-Nachschub!), bergig = flacher + weiter weg (Terrain-Clipping) */
  const kamera = useMemo(() => {
    if (!track) return { zoomBase: 14.5, pitchBase: 62 };
    const vVideo = track.totalDistance / FLYOVER_DAUER_S; // m/s im Video
    let zoomBase: number;
    if (vVideo < 20) zoomBase = 15.0;
    else if (vVideo < 40) zoomBase = 14.4;
    else if (vVideo < 80) zoomBase = 13.8;
    else if (vVideo < 150) zoomBase = 13.2;
    else zoomBase = 12.6;
    if (track.istBergig) zoomBase -= 0.5;
    return { zoomBase, pitchBase: track.istBergig ? 48 : 60 };
  }, [track]);

  const koords = useMemo(
    () => track?.punkte.map((p) => [p.lng, p.lat] as [number, number]) ?? [],
    [track]
  );

  /* ---------- Karte initialisieren ---------- */
  useEffect(() => {
    if (!containerRef.current || !track || koords.length < 2) return;
    const bounds = koords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(koords[0], koords[0])
    );
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 48 },
      attributionControl: { compact: true },
      maxPitch: 85,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("error", (e) => console.error("[maplibre]", e?.error ?? e));

    map.on("load", () => {
      aktiviere3D(map);
      map.addSource("route", {
        type: "geojson",
        lineMetrics: true,
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: koords },
        },
      });
      // Ghost-Trail: komplette Route, gedimmt (Kontext)
      map.addLayer({
        id: "ghost-linie",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 4,
          "line-opacity": 0.25,
          "line-gradient": ghostGradient(farbStopsRef.current) as never,
        },
      });
      // Progress-Trail: gleiche Quelle, Gradient wird pro Frame gekappt
      map.addLayer({
        id: "progress-linie",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 5,
          "line-gradient": progressGradient(farbStopsRef.current, 1e-4) as never,
        },
      });
      map.addSource("laeufer", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: koords[0] } },
      });
      map.addLayer({
        id: "laeufer-punkt",
        type: "circle",
        source: "laeufer",
        paint: {
          "circle-radius": 7,
          "circle-color": "#2ee6c7",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      setBereit(true);
    });

    /* Tile-Vorladen + erstes Idle → erst dann Play freigeben */
    let abgebrochen = false;
    const punkteFuerPrefetch = track.punkte.map((p) => ({ lng: p.lng, lat: p.lat }));
    const prefetch = prefetchFlyoverTiles(punkteFuerPrefetch, (p) => {
      if (!abgebrochen) setLadeProzent(Math.min(97, p));
    });
    const erstesIdle = new Promise<void>((resolve) => map.once("idle", () => resolve()));
    Promise.all([prefetch, erstesIdle]).then(() => {
      if (!abgebrochen) {
        setLadeProzent(100);
        setVorgeladen(true);
      }
    });
    const notausgang = setTimeout(() => {
      if (!abgebrochen) setVorgeladen(true);
    }, 25_000);

    return () => {
      abgebrochen = true;
      clearTimeout(notausgang);
      cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, koords]);

  /* Farbmodus umschalten */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bereit || farbStops.length === 0) return;
    map.setPaintProperty("ghost-linie", "line-gradient", ghostGradient(farbStops) as never);
    map.setPaintProperty(
      "progress-linie",
      "line-gradient",
      progressGradient(
        farbStops,
        track ? sampleAt(track, tVideoRef.current * k).distCum / track.totalDistance : 0
      ) as never
    );
  }, [farbStops, bereit, track, k]);

  /* ---------- Frame-Rendering ---------- */
  const renderZustand = useCallback(
    (st: SampledState, dtS: number, sofort = false) => {
      const map = mapRef.current;
      if (!map || !track) return;

      (map.getSource("laeufer") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [st.lng, st.lat] },
      });

      /* Progress-Trail-Gradient (gedrosselt ~20/s) */
      const jetzt = performance.now();
      if (sofort || jetzt - gradDrosselRef.current > 50) {
        gradDrosselRef.current = jetzt;
        map.setPaintProperty(
          "progress-linie",
          "line-gradient",
          progressGradient(farbStopsRef.current, st.distCum / track.totalDistance) as never
        );
      }

      /* Chase-Kamera: lookAhead (1 Videosekunde voraus, Gewicht 0.3) */
      const lookAhead = sampleAt(
        track,
        Math.min(track.totalDuration, st.tRel + 1.0 * k),
        undefined
      );
      const zielLng = st.lng + (lookAhead.lng - st.lng) * 0.3;
      const zielLat = st.lat + (lookAhead.lat - st.lat) * 0.3;

      // Bearing exponentiell glätten (alpha 0.08 bei 60 fps, dt-normiert)
      const alpha = Math.min(1, 0.08 * (dtS * 60 || 1));
      const delta = wrapDelta(st.bearing - kamBearingRef.current);
      kamBearingRef.current += delta * alpha;
      if (!Number.isFinite(kamBearingRef.current)) kamBearingRef.current = st.bearing;

      // Speed-gekoppelter Zoom/Pitch (Tiefpass ~1 s)
      const speedNorm = Math.min(
        1,
        Math.max(0, (st.speed - track.speedP10) / (track.speedP90 - track.speedP10))
      );
      const zielZoom = kamera.zoomBase - (speedNorm - 0.5) * 0.8;
      const zielPitch = kamera.pitchBase + speedNorm * 8;
      const tp = sofort ? 1 : Math.min(1, dtS / 1.0);
      kamZoomRef.current = kamZoomRef.current == null ? zielZoom : kamZoomRef.current + (zielZoom - kamZoomRef.current) * tp;
      kamPitchRef.current =
        kamPitchRef.current == null ? zielPitch : kamPitchRef.current + (zielPitch - kamPitchRef.current) * tp;

      map.jumpTo({
        center: [zielLng, zielLat],
        bearing: ((kamBearingRef.current % 360) + 360) % 360,
        pitch: kamPitchRef.current,
        zoom: kamZoomRef.current,
      });

      /* HUD (gedrosselt ~5/s): REALwerte, nie Videogeschwindigkeit */
      if (sofort || jetzt - hudDrosselRef.current > 180) {
        hudDrosselRef.current = jetzt;
        setHud({
          zeit: formatDauer(st.tRel),
          km: (st.distCum / 1000).toFixed(2),
          pace: st.speed > 0.3 ? formatPace(1000 / st.speed) : "–",
          ele: Math.round(st.ele),
          hr: st.hr != null ? Math.round(st.hr) : null,
        });
      }
    },
    [track, k, kamera]
  );

  /* ---------- Frame-Loop (Wanduhr, nie Frame-Zähler) ---------- */
  const frame = useCallback(
    (nowMs: number) => {
      if (!spieltRef.current || !track) return;
      if (startMsRef.current === null) startMsRef.current = nowMs;
      const dtS = Math.min(0.1, (nowMs - letzterFrameMsRef.current) / 1000) || 0.016;
      letzterFrameMsRef.current = nowMs;

      const tVideo = Math.min(
        (nowMs - startMsRef.current) / 1000 - pausedAccumRef.current,
        FLYOVER_DAUER_S
      );
      tVideoRef.current = tVideo;
      const st = sampleAt(track, tVideo * k, cursorRef.current);
      renderZustand(st, dtS);

      if (tVideo >= FLYOVER_DAUER_S) {
        spieltRef.current = false;
        setSpielt(false);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    },
    [track, k, renderZustand]
  );

  const play = useCallback(() => {
    if (!track) return;
    if (tVideoRef.current >= FLYOVER_DAUER_S) {
      // Replay
      startMsRef.current = null;
      pausedAccumRef.current = 0;
      tVideoRef.current = 0;
      cursorRef.current.idx = 0;
    } else if (pauseBeginnRef.current != null) {
      pausedAccumRef.current += (performance.now() - pauseBeginnRef.current) / 1000;
      pauseBeginnRef.current = null;
    }
    const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduziert) {
      tVideoRef.current = FLYOVER_DAUER_S;
      renderZustand(sampleAt(track, track.totalDuration), 1, true);
      return;
    }
    spieltRef.current = true;
    setSpielt(true);
    letzterFrameMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
  }, [track, frame, renderZustand]);

  const pause = useCallback(() => {
    spieltRef.current = false;
    setSpielt(false);
    pauseBeginnRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
  }, []);

  const seek = useCallback(
    (tVideo: number) => {
      if (!track) return;
      const t = Math.min(FLYOVER_DAUER_S, Math.max(0, tVideo));
      tVideoRef.current = t;
      cursorRef.current.idx = 0;
      // Wanduhr neu verankern, damit Play nahtlos weiterläuft
      startMsRef.current = performance.now() - t * 1000;
      pausedAccumRef.current = 0;
      pauseBeginnRef.current = spieltRef.current ? null : performance.now();
      renderZustand(sampleAt(track, t * k, cursorRef.current), 0.016, true);
    },
    [track, k, renderZustand]
  );

  const reset = useCallback(() => {
    pause();
    startMsRef.current = null;
    pausedAccumRef.current = 0;
    pauseBeginnRef.current = null;
    tVideoRef.current = 0;
    cursorRef.current.idx = 0;
    kamZoomRef.current = null;
    kamPitchRef.current = null;
    const map = mapRef.current;
    if (map && koords.length >= 2) {
      const bounds = koords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(koords[0], koords[0])
      );
      map.fitBounds(bounds, { padding: 48, pitch: 0, bearing: 0 });
      map.setPaintProperty(
        "progress-linie",
        "line-gradient",
        progressGradient(farbStopsRef.current, 1e-4) as never
      );
      (map.getSource("laeufer") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: koords[0] },
      });
    }
    setHud(null);
  }, [pause, koords]);

  /* Tastatur: Space = Play/Pause, Pfeile = ±1 s Videozeit */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (spieltRef.current) pause();
        else if (vorgeladen) play();
      } else if (e.code === "ArrowRight") {
        seek(tVideoRef.current + 1);
      } else if (e.code === "ArrowLeft") {
        seek(tVideoRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, pause, seek, vorgeladen]);

  /* Hover aus dem Höhenprofil → Marker bewegen (Distanzanteil) */
  useEffect(() => {
    if (hoverFortschritt == null || !track) return;
    const map = mapRef.current;
    if (!map || !bereit) return;
    const zielDist = hoverFortschritt * track.totalDistance;
    // grobe Suche über distCum reicht für den Hover-Marker
    const pts = track.punkte;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].distCum < zielDist) lo = mid + 1;
      else hi = mid;
    }
    (map.getSource("laeufer") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [pts[lo].lng, pts[lo].lat] },
    });
  }, [hoverFortschritt, bereit, track]);

  if (!track || !graphDaten) {
    return (
      <div className={cn("flex h-64 items-center justify-center rounded-xl bg-muted/40 text-sm text-muted-foreground", className)}>
        Keine verwertbaren GPS-Daten für diese Aktivität.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative h-80 overflow-hidden rounded-xl border border-border md:h-105">
        {/* Inline-Style: maplibre-gl.css setzt .maplibregl-map auf
            position:relative — Grösse deshalb hart vorgeben */}
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />

        {/* HUD: Realzeit/Realpace + Zeitraffer-Hinweis */}
        {hud && (
          <div className="stat-mono absolute left-2 top-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-background/85 px-3 py-1.5 text-xs backdrop-blur">
            <span>{hud.zeit}</span>
            <span>{hud.km} km</span>
            <span>{hud.pace}</span>
            <span>{hud.ele} m</span>
            {hud.hr != null && <span>{hud.hr} bpm</span>}
            <span className="text-[10px] text-muted-foreground">
              {Math.max(1, Math.round(k))}× Zeitraffer
            </span>
          </div>
        )}

        {/* Verlaufsgraph als Teil des HUD am unteren Kartenrand */}
        {vorgeladen && (
          <div className="absolute inset-x-0 bottom-0">
            <FlyoverGraph
              track={track}
              daten={graphDaten}
              tVideoRef={tVideoRef}
              videoDauerS={FLYOVER_DAUER_S}
              onScrub={seek}
              heightPx={96}
            />
          </div>
        )}

        {/* Lade-Overlay: erst zeigen, wenn Route-Tiles vorgeladen sind */}
        {!vorgeladen && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90">
            <Loader2 className="size-6 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">
              3D-Karte wird vorgeladen … {ladeProzent} %
            </div>
            <Progress value={ladeProzent} className="h-1.5 w-44" />
          </div>
        )}
      </div>

      {/* Steuerung */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={spielt ? pause : play}
          disabled={!bereit || !vorgeladen}
          className="min-w-23"
        >
          {!vorgeladen ? (
            <Loader2 className="size-4 animate-spin" />
          ) : spielt ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {!vorgeladen ? "Lädt…" : spielt ? "Pause" : "Flyover"}
        </Button>
        <Button size="sm" variant="secondary" onClick={reset} disabled={!bereit || !vorgeladen}>
          <RotateCcw className="size-4" />
        </Button>
        <div className="flex rounded-lg bg-muted p-0.5">
          {(["pace", "hr"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModus(m)}
              className={cn(
                "min-h-8 rounded-md px-2.5 text-xs",
                modus === m ? "bg-background font-semibold" : "text-muted-foreground"
              )}
            >
              {m === "hr" ? "Herzfrequenz" : "Pace"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          30-s-Flyover · Tempoverhältnisse originalgetreu
          {track.pausenKomprimiert ? " · Pausen komprimiert" : ""}
        </span>
      </div>
    </div>
  );
}
