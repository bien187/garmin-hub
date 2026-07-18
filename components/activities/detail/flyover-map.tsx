"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import along from "@turf/along";
import bezierSpline from "@turf/bezier-spline";
import { lineString } from "@turf/helpers";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { aktiviere3D, BASEMAP_STYLE } from "@/lib/geo/map-style";
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

interface Punkt {
  lng: number;
  lat: number;
  ele: number;
  hr: number | null;
  pace: number | null;
  dist: number;
  zeit: number;
}

/** Streams auf gültige, gleichmässig reduzierte Punkte eindampfen */
function baueRoute(s: FlyoverStreams, maxPunkte: number): Punkt[] {
  const roh: Punkt[] = [];
  const n = s.zeitS.length;
  let letzteEle = 0;
  let letzteDist = 0;
  for (let i = 0; i < n; i++) {
    const lat = s.lat[i];
    const lng = s.lng[i];
    if (lat == null || lng == null || Math.abs(lat) < 0.01) continue;
    letzteEle = s.ele[i] ?? letzteEle;
    letzteDist = s.distanzM[i] ?? letzteDist;
    roh.push({
      lng,
      lat,
      ele: letzteEle,
      hr: s.hr[i],
      pace: s.paceSKm[i],
      dist: letzteDist,
      zeit: s.zeitS[i],
    });
  }
  if (roh.length <= maxPunkte) return roh;
  const schritt = roh.length / maxPunkte;
  const out: Punkt[] = [];
  for (let i = 0; i < maxPunkte; i++) out.push(roh[Math.floor(i * schritt)]);
  out.push(roh[roh.length - 1]);
  return out;
}

/** Kompass-Bearing (Grad) von a nach b */
function bearingGrad(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Farbstops für line-gradient nach HR oder Pace */
function gradientExpression(punkte: Punkt[], modus: "hr" | "pace"): unknown {
  const werte = punkte
    .map((p) => (modus === "hr" ? p.hr : p.pace))
    .filter((v): v is number => v != null && v > 0);
  if (werte.length < 10) return "#2ee6c7";
  const sortiert = [...werte].sort((a, b) => a - b);
  const min = sortiert[Math.floor(sortiert.length * 0.05)];
  const max = sortiert[Math.floor(sortiert.length * 0.95)];
  const farbe = (v: number | null): string => {
    if (v == null || v <= 0) return "#5b6b7d";
    let f = (v - min) / Math.max(1e-6, max - min);
    f = Math.min(1, Math.max(0, f));
    if (modus === "pace") f = 1 - f; // schnell = heiss
    const hue = 160 - 140 * f;
    return `hsl(${Math.round(hue)} 85% 55%)`;
  };
  const stops: unknown[] = [];
  const anzahl = Math.min(40, punkte.length);
  for (let i = 0; i < anzahl; i++) {
    const idx = Math.floor((i / (anzahl - 1)) * (punkte.length - 1));
    stops.push(i / (anzahl - 1), farbe(modus === "hr" ? punkte[idx].hr : punkte[idx].pace));
  }
  return ["interpolate", ["linear"], ["line-progress"], ...stops];
}

interface FlyoverMapProps {
  streams: FlyoverStreams;
  className?: string;
  /** Hover-Position aus dem Höhenprofil (0..1) — bewegt nur den Marker */
  hoverFortschritt?: number | null;
}

export function FlyoverMap({ streams, className, hoverFortschritt }: FlyoverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rafRef = useRef<number>(0);
  const bearingRef = useRef(0);
  const letzterIdxRef = useRef(-1);
  const uiDrosselRef = useRef(0);
  const fortschrittRef = useRef(0); // 0..1
  const spieltRef = useRef(false);
  const speedRef = useRef(4);
  const [bereit, setBereit] = useState(false);
  const [spielt, setSpielt] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [modus, setModus] = useState<"hr" | "pace">("hr");
  const [fortschrittUi, setFortschrittUi] = useState(0);
  const [live, setLive] = useState<{ km: number; pace: number | null; hr: number | null; ele: number } | null>(null);

  // Mittelklasse-Handys: Punktdichte adaptiv reduzieren
  const maxPunkte =
    typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4
      ? 700
      : 1400;
  const punkte = useMemo(() => baueRoute(streams, maxPunkte), [streams, maxPunkte]);

  /** Geglätteter Kamerapfad (turf bezier-spline über reduzierte Keyframes) */
  const kameraPfad = useMemo(() => {
    if (punkte.length < 4) return punkte;
    const gesamt = punkte[punkte.length - 1].dist - punkte[0].dist;
    const keyframes: [number, number][] = [];
    const linie = lineString(punkte.map((p) => [p.lng, p.lat]));
    const anzahl = Math.min(80, Math.max(16, Math.floor(gesamt / 150)));
    for (let i = 0; i <= anzahl; i++) {
      const d = (gesamt / 1000) * (i / anzahl);
      try {
        const pt = along(linie, Math.max(0.001, d), { units: "kilometers" });
        keyframes.push(pt.geometry.coordinates as [number, number]);
      } catch {
        /* letzter Punkt */
      }
    }
    // bezier-spline kann bei kurzen/duplizierten Keyframes NaN-Punkte
    // liefern — die vergiften sonst lautlos die Kamera-Matrix (schwarzer
    // Bildschirm). Deshalb strikt auf endliche Koordinaten filtern.
    const nurEndlich = (pts: { lng: number; lat: number }[]) =>
      pts.filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
    try {
      const glatt = bezierSpline(lineString(keyframes), { resolution: 4000 });
      const pts = nurEndlich(
        (glatt.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lng, lat }))
      );
      if (pts.length >= 2) return pts;
    } catch {
      /* Fallback unten */
    }
    const roh = nurEndlich(keyframes.map(([lng, lat]) => ({ lng, lat })));
    return roh.length >= 2 ? roh : punkte;
  }, [punkte]);

  const gesamtDist = punkte.length ? punkte[punkte.length - 1].dist - punkte[0].dist : 0;

  const punktBeiFortschritt = useCallback(
    (f: number): { punkt: Punkt; idx: number; lng: number; lat: number } | null => {
      if (punkte.length === 0) return null;
      const zielDist = punkte[0].dist + gesamtDist * f;
      // binäre Suche über kumulierte Distanz
      let lo = 0;
      let hi = punkte.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (punkte[mid].dist < zielDist) lo = mid + 1;
        else hi = mid;
      }
      // Position zwischen den Stützpunkten interpolieren → butterweiche
      // Kamerabewegung statt 3-m-Sprüngen
      const b = punkte[lo];
      const a = lo > 0 ? punkte[lo - 1] : b;
      const spanne = b.dist - a.dist;
      const t = spanne > 0 ? Math.min(1, Math.max(0, (zielDist - a.dist) / spanne)) : 1;
      return {
        punkt: b,
        idx: lo,
        lng: a.lng + (b.lng - a.lng) * t,
        lat: a.lat + (b.lat - a.lat) * t,
      };
    },
    [punkte, gesamtDist]
  );

  /* ---------- Karte initialisieren ---------- */
  useEffect(() => {
    if (!containerRef.current || punkte.length < 2) return;
    const koords = punkte.map((p) => [p.lng, p.lat] as [number, number]);
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
      pitch: 0,
      maxPitch: 85,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    // Diagnose-Hooks: maplibre-Fehler landen sonst nirgends sichtbar
    map.on("error", (e) => console.error("[maplibre]", e?.error ?? e));
    (window as unknown as { __ghqMap?: maplibregl.Map }).__ghqMap = map;

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
      map.addLayer({
        id: "route-linie",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 4,
          "line-gradient": gradientExpression(punkte, "hr") as never,
        },
      });

      map.addSource("progress", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "progress-linie",
        type: "line",
        source: "progress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 6, "line-color": "#ffffff", "line-opacity": 0.9 },
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

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [punkte]);

  /* Hover aus dem Höhenprofil → Marker synchron bewegen */
  useEffect(() => {
    if (hoverFortschritt == null) return;
    const map = mapRef.current;
    if (!map || !bereit) return;
    const p = punktBeiFortschritt(hoverFortschritt);
    if (!p) return;
    (map.getSource("laeufer") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    });
  }, [hoverFortschritt, bereit, punktBeiFortschritt]);

  /* Farbmodus umschalten */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bereit) return;
    map.setPaintProperty(
      "route-linie",
      "line-gradient",
      gradientExpression(punkte, modus) as never
    );
  }, [modus, bereit, punkte]);

  /* ---------- Render eines Frames (Kamera + Progress + Marker) ---------- */
  const renderFrame = useCallback(
    (f: number) => {
      const map = mapRef.current;
      if (!map || punkte.length < 2) return;
      const pos = punktBeiFortschritt(f);
      if (!pos) return;
      const { punkt: p, idx } = pos;

      // Marker folgt der interpolierten Position (jeden Frame, billig)
      (map.getSource("laeufer") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
      });
      // Fortschrittslinie nur bei Punktwechsel neu aufbauen (teurer Slice)
      if (idx !== letzterIdxRef.current) {
        letzterIdxRef.current = idx;
        (map.getSource("progress") as maplibregl.GeoJSONSource | undefined)?.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: punkte.slice(0, Math.max(2, idx + 1)).map((q) => [q.lng, q.lat]),
          },
        });
      }

      // Kamera: folgt dem geglätteten Pfad leicht hinter dem Läuferpunkt.
      // (MapLibre hat keine FreeCamera-API — jumpTo pro Frame mit
      // gedämpftem Bearing liefert denselben Verfolger-Effekt.)
      const kamIdx = Math.max(
        0,
        Math.floor(f * (kameraPfad.length - 1)) - Math.max(4, Math.floor(kameraPfad.length * 0.02))
      );
      const kamPos = kameraPfad[kamIdx];
      const zielBearing = kamPos ? bearingGrad(kamPos, pos) : bearingRef.current;
      if (Number.isFinite(zielBearing)) {
        const alt = bearingRef.current;
        // kürzester Winkelweg, gedämpft (Anti-Jitter)
        let delta = ((zielBearing - alt + 540) % 360) - 180;
        if (Math.abs(delta) > 90) delta = Math.sign(delta) * 90;
        bearingRef.current = alt + delta * 0.12;
      }
      if (!Number.isFinite(bearingRef.current)) bearingRef.current = 0;
      // Zoom ans Tempo koppeln: schnellerer Flug = weiter draussen, sonst
      // kommt der Tile-Nachschub nicht nach (→ leere/schwarze Karte)
      const zoomFuerSpeed: Record<number, number> = { 1: 15.2, 4: 14.5, 10: 13.7 };
      map.jumpTo({
        center: [pos.lng, pos.lat],
        bearing: bearingRef.current,
        pitch: 62,
        zoom: zoomFuerSpeed[speedRef.current] ?? 14.5,
      });

      // React-Updates drosseln (~5/s): 60 setState/s würgen Mittelklasse-
      // Geräte ab, ohne dass man es der Anzeige ansieht
      const jetztMs = performance.now();
      if (jetztMs - uiDrosselRef.current > 180 || !spieltRef.current) {
        uiDrosselRef.current = jetztMs;
        setLive({
          km: (p.dist - punkte[0].dist) / 1000,
          pace: p.pace,
          hr: p.hr,
          ele: Math.round(p.ele),
        });
        setFortschrittUi(f * 100);
      }
    },
    [punkte, kameraPfad, punktBeiFortschritt]
  );

  /* ---------- Animations-Loop ---------- */
  const loop = useCallback(
    (letzteZeit: number) => {
      const schritt = (jetzt: number) => {
        if (!spieltRef.current) return;
        const dt = (jetzt - letzteZeit) / 1000;
        letzteZeit = jetzt;
        // Grundtempo 7.5 m/s pro Stufe (1×/4×/10×) — schnell genug fürs
        // Kino-Gefühl, langsam genug für den Karten-Tile-Nachschub
        const meterProSek = 7.5 * speedRef.current;
        fortschrittRef.current += (meterProSek * dt) / Math.max(1, gesamtDist);
        if (fortschrittRef.current >= 1) {
          fortschrittRef.current = 1;
          spieltRef.current = false;
          setSpielt(false);
        }
        renderFrame(fortschrittRef.current);
        if (spieltRef.current) rafRef.current = requestAnimationFrame(schritt);
      };
      rafRef.current = requestAnimationFrame(schritt);
    },
    [gesamtDist, renderFrame]
  );

  const togglePlay = useCallback(() => {
    const reduziert =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (spieltRef.current) {
      spieltRef.current = false;
      setSpielt(false);
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (fortschrittRef.current >= 1) fortschrittRef.current = 0;
    spieltRef.current = true;
    setSpielt(true);
    if (reduziert) {
      // prefers-reduced-motion: direkt ans Ende springen
      fortschrittRef.current = 1;
      renderFrame(1);
      spieltRef.current = false;
      setSpielt(false);
      return;
    }
    loop(performance.now());
  }, [loop, renderFrame]);

  const reset = useCallback(() => {
    spieltRef.current = false;
    setSpielt(false);
    cancelAnimationFrame(rafRef.current);
    fortschrittRef.current = 0;
    setFortschrittUi(0);
    const map = mapRef.current;
    if (map && punkte.length >= 2) {
      const koords = punkte.map((p) => [p.lng, p.lat] as [number, number]);
      const bounds = koords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(koords[0], koords[0])
      );
      map.fitBounds(bounds, { padding: 48, pitch: 0 });
      (map.getSource("progress") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] },
      });
    }
  }, [punkte]);

  if (punkte.length < 2) {
    return (
      <div className={cn("flex h-64 items-center justify-center rounded-xl bg-muted/40 text-sm text-muted-foreground", className)}>
        Keine GPS-Daten für diese Aktivität.
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
        {/* Live-Anzeige */}
        {live && (
          <div className="stat-mono absolute left-2 top-2 flex gap-3 rounded-lg bg-background/85 px-3 py-1.5 text-xs backdrop-blur">
            <span>{live.km.toFixed(2)} km</span>
            <span>{formatPace(live.pace)}</span>
            <span>{live.hr != null ? `${Math.round(live.hr)} bpm` : "–"}</span>
            <span>{live.ele} m</span>
          </div>
        )}
      </div>

      {/* Steuerung */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={togglePlay} disabled={!bereit} className="min-w-23">
          {spielt ? <Pause className="size-4" /> : <Play className="size-4" />}
          {spielt ? "Pause" : "Flyover"}
        </Button>
        <Button size="sm" variant="secondary" onClick={reset} disabled={!bereit}>
          <RotateCcw className="size-4" />
        </Button>
        <div className="flex rounded-lg bg-muted p-0.5">
          {[1, 4, 10].map((s) => (
            <button
              key={s}
              onClick={() => {
                setSpeed(s);
                speedRef.current = s;
              }}
              className={cn(
                "min-h-8 rounded-md px-2.5 text-xs",
                speed === s ? "bg-background font-semibold" : "text-muted-foreground"
              )}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-muted p-0.5">
          {(["hr", "pace"] as const).map((m) => (
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
        <div className="min-w-40 flex-1">
          <Slider
            value={[fortschrittUi]}
            max={100}
            step={0.5}
            onValueChange={([v]) => {
              spieltRef.current = false;
              setSpielt(false);
              cancelAnimationFrame(rafRef.current);
              fortschrittRef.current = v / 100;
              renderFrame(v / 100);
            }}
          />
        </div>
        <span className="stat-mono w-14 text-right text-xs text-muted-foreground">
          {formatDauer(
            (punktBeiFortschritt(fortschrittUi / 100)?.punkt.zeit ?? 0) - (punkte[0]?.zeit ?? 0)
          )}
        </span>
      </div>
    </div>
  );
}
