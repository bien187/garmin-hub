"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, Maximize2, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  aktiviere3D,
  BASEMAP_STYLE,
  fuegeRasterBasemapsHinzu,
  KARTEN_TYPEN,
  rasterTemplate,
  setzeKartenTyp,
  setzeRasterLod,
  type KartenTyp,
} from "@/lib/geo/map-style";
import { prefetchFlyoverTiles } from "@/lib/geo/tile-prefetch";
import {
  baueGraphDaten,
  bearingGrad,
  berechneK,
  flyoverProfil,
  haversineM,
  sampleAt,
  SampleCursor,
  verarbeiteStreams,
  wrapDelta,
  type GraphDaten,
  type ProcessedTrack,
  type SampledState,
} from "@/lib/engine/flyover";
import { formatDauer, formatPace } from "@/lib/format";
import { cn } from "@/lib/utils";

/** API, die die Detailseite bekommt, um den Graph unter der Karte zu rendern */
export interface FlyoverApi {
  track: ProcessedTrack;
  graphDaten: GraphDaten;
  tVideoRef: React.MutableRefObject<number>;
  seek: (tVideo: number) => void;
  /** Spielzeit dieses Flyovers — je nach Aktivitätsart verschieden */
  videoDauerS: number;
}

/** Spalten können ganz fehlen (Halleneinheit ohne GPS) — siehe Engine */
export interface FlyoverStreams {
  zeitS: number[] | null;
  lat?: (number | null)[] | null;
  lng?: (number | null)[] | null;
  ele?: (number | null)[] | null;
  hr?: (number | null)[] | null;
  paceSKm?: (number | null)[] | null;
  distanzM?: (number | null)[] | null;
}

interface FlyoverMapProps {
  streams: FlyoverStreams;
  /** Garmin-Aktivitätstyp — steuert Spielzeit, Zoom und Track-Auflösung */
  typ?: string;
  className?: string;
  /** Wird gerufen, sobald Track + Graphdaten stehen (für den externen Graph) */
  onBereit?: (api: FlyoverApi) => void;
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

/* Kamera-Weichheit: grosse Zeitkonstanten = träge, "grobe" Verfolgung statt
   Zittern bei jedem GPS-Rauschen. Bearing wird bewusst NICHT aus dem rohen
   Track-Bearing genommen, sondern aus der Bewegungsrichtung der bereits
   geglätteten Kameraposition selbst abgeleitet — das dämpft Richtungs-
   rauschen an der Quelle statt es nur hinterher zu glätten. */
const KAM_TAU_POSITION_S = 1.1;
const KAM_TAU_BEARING_S = 2.2;
const KAM_TAU_ZOOM_PITCH_S = 1.6;
const ZOOM_MIN = 7;
const ZOOM_MAX = 19;

/**
 * Render-Auflösung: Ein iPhone meldet devicePixelRatio 3 — das sind 2,25×
 * so viele Pixel wie bei 2, und mit Terrain wird jeder Kachelinhalt noch
 * einmal in Texturen gerendert. Auf Touch-Geräten 1,5 reicht für ein
 * scharfes Satellitenbild und hält den Flug flüssig.
 */
function flyoverPixelRatio(): number {
  const dpr = window.devicePixelRatio || 1;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  return Math.min(dpr, touch ? 1.5 : 2);
}

/** Läuferpunkt als DOM-Element (siehe setzeLaeufer) */
const LAEUFER_KLASSEN =
  "pointer-events-none absolute left-0 top-0 z-[1] size-4 rounded-full border-[2.5px] border-white bg-[#2ee6c7] shadow-[0_0_0_4px_rgba(46,230,199,0.25),0_1px_4px_rgba(0,0,0,0.5)] will-change-transform";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function FlyoverMap({ streams, typ, className, onBereit }: FlyoverMapProps) {
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

  /* Weiche Kamera: geglättete Position + daraus abgeleitetes Bearing */
  const kamLngRef = useRef<number | null>(null);
  const kamLatRef = useRef<number | null>(null);
  const kamPosVorRef = useRef<{ lng: number; lat: number } | null>(null);
  const kamBearingRef = useRef(0);
  const autoZoomRef = useRef<number | null>(null);
  const kamPitchRef = useRef<number | null>(null);
  /** Persistenter Nutzer-Offset (Pinch/Wheel/+−-Tasten), bleibt über Frames erhalten */
  const zoomOffsetRef = useRef(0);

  const letzterFrameMsRef = useRef(0);
  const hudDrosselRef = useRef(0);
  const gradDrosselRef = useRef(0);
  /** true während der Schlussfahrt — deren Zoom stammt nicht vom Nutzer */
  const outroRef = useRef(false);

  /* Läuferpunkt + HUD direkt im DOM: kein React-Render pro Frame */
  const laeuferElRef = useRef<HTMLDivElement>(null);
  const laeuferPosRef = useRef<[number, number] | null>(null);
  const hudElRef = useRef<HTMLDivElement>(null);
  const hudZeitRef = useRef<HTMLSpanElement>(null);
  const hudKmRef = useRef<HTMLSpanElement>(null);
  const hudPaceRef = useRef<HTMLSpanElement>(null);
  const hudEleRef = useRef<HTMLSpanElement>(null);
  const hudHrRef = useRef<HTMLSpanElement>(null);

  const [bereit, setBereit] = useState(false);
  const [ladeProzent, setLadeProzent] = useState(0);
  const [vorgeladen, setVorgeladen] = useState(false);
  const [spielt, setSpielt] = useState(false);
  const [modus, setModus] = useState<"hr" | "pace">("pace");
  // Satellit als Standard — wie beim Strava-Flyover, und ohne Vektorkarte
  // darunter auch die leichteste Variante für das Handy
  const [kartenTyp, setKartenTyp] = useState<KartenTyp>("satellit");
  const kartenTypRef = useRef<KartenTyp>("satellit");
  kartenTypRef.current = kartenTyp;
  const [vollbild, setVollbild] = useState(false);

  /* ---- Preprocessing (pure Engine) ---- */
  const profil = useMemo(() => flyoverProfil(typ), [typ]);
  const track = useMemo(
    () =>
      verarbeiteStreams(streams, {
        vMax: profil.vMax,
        glaettungS: profil.glaettungS,
        maxPunkte: profil.maxPunkte,
      }),
    [streams, profil]
  );
  const graphDaten = useMemo(() => (track ? baueGraphDaten(track) : null), [track]);
  const k = useMemo(() => (track ? berechneK(track, profil.dauerS) : 1), [track, profil]);
  const farbStops = useMemo(
    () => (track ? baueFarbStops(track, modus) : []),
    [track, modus]
  );
  const farbStopsRef = useRef(farbStops);
  farbStopsRef.current = farbStops;

  /* Kamera-Basiswerte: Zoom an mittlere VIDEO-Geschwindigkeit gekoppelt
     (Tile-Nachschub!), bergig = flacher + weiter weg (Terrain-Clipping) */
  const kamera = useMemo(() => {
    if (!track) return { zoomBase: 15.5, pitchBase: 62 };
    const vVideo = track.totalDistance / profil.dauerS; // m/s im Video
    // Grundsätzlich näher dran als eine reine Übersichtsflughöhe: man soll
    // Wege, Waldränder und Gebäude erkennen. Die Staffelung nach Video-
    // geschwindigkeit bleibt, damit bei schnellem Vorankommen nicht alles
    // vorbeirauscht — nur eine Zoomstufe tiefer als zuvor.
    let zoomBase: number;
    if (vVideo < 20) zoomBase = 16.0;
    else if (vVideo < 40) zoomBase = 15.4;
    else if (vVideo < 80) zoomBase = 14.8;
    else if (vVideo < 150) zoomBase = 14.2;
    else if (vVideo < 250) zoomBase = 13.8;
    else zoomBase = 13.4;
    if (track.istBergig) zoomBase -= 0.5;
    return {
      zoomBase: zoomBase + profil.zoomBonus,
      pitchBase: (track.istBergig ? 48 : 60) + profil.pitchBonus,
    };
  }, [track, profil]);

  const koords = useMemo(
    () => track?.punkte.map((p) => [p.lng, p.lat] as [number, number]) ?? [],
    [track]
  );

  /* Track/Graphdaten dem Elternteil melden (rendert den Graph unter der Karte) */
  const seekRef = useRef<(t: number) => void>(() => {});
  useEffect(() => {
    if (track && graphDaten && onBereit) {
      onBereit({
        track,
        graphDaten,
        tVideoRef,
        seek: (t: number) => seekRef.current(t),
        videoDauerS: profil.dauerS,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, graphDaten]);

  /* ---------- Läuferpunkt + HUD (DOM statt React/GeoJSON) ---------- */

  /* Der Punkt war eine GeoJSON-Quelle mit setData in jedem Frame: das
     schickt die Geometrie jedes Mal an den Worker, baut den Kachelindex
     neu und lädt alle Kacheln der Quelle nach — auf dem Handy der teuerste
     Teil des ganzen Frames. Ein DOM-Punkt per map.project (rechnet die
     Terrainhöhe aus dem DEM auf der CPU mit) kostet praktisch nichts.
     Kein maplibregl.Marker: der liest für die Verdeckungsprüfung bis zu
     zehnmal pro Sekunde Pixel von der GPU zurück. */
  const positioniereLaeufer = useCallback((map: maplibregl.Map) => {
    const el = laeuferElRef.current;
    const pos = laeuferPosRef.current;
    if (!el || !pos) return;
    const p = map.project(pos);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    // -8 px = halbe Punktgrösse (size-4), damit die Mitte auf der Strecke liegt
    el.style.transform = `translate3d(${p.x - 8}px, ${p.y - 8}px, 0)`;
  }, []);

  const setzeLaeufer = useCallback(
    (map: maplibregl.Map, pos: [number, number]) => {
      laeuferPosRef.current = pos;
      positioniereLaeufer(map);
    },
    [positioniereLaeufer]
  );

  const schreibeHud = useCallback((st: SampledState) => {
    const el = hudElRef.current;
    if (!el) return;
    el.hidden = false;
    const setze = (ref: React.RefObject<HTMLSpanElement | null>, text: string) => {
      if (ref.current && ref.current.textContent !== text) ref.current.textContent = text;
    };
    setze(hudZeitRef, formatDauer(st.tRel));
    setze(hudKmRef, `${(st.distCum / 1000).toFixed(2)} km`);
    setze(hudPaceRef, st.speed > 0.3 ? formatPace(1000 / st.speed) : "–");
    setze(hudEleRef, `${Math.round(st.ele)} m`);
    setze(hudHrRef, st.hr != null ? `${Math.round(st.hr)} bpm` : "");
    if (hudHrRef.current) hudHrRef.current.hidden = st.hr == null;
  }, []);

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
      pixelRatio: flyoverPixelRatio(),
      // Abgelaufene Kacheln nicht im Flug neu laden
      refreshExpiredTiles: false,
    });
    // Nutzer-Zoom (Pinch, Wheel, +/−-Tasten der NavigationControl) auch
    // während des Flyovers erlauben: eigene jumpTo-Aufrufe markieren wir
    // mit eventData.ghqAuto, alle anderen 'zoom'-Events sind vom Nutzer —
    // deren Differenz zum automatischen Zoom merken wir uns als
    // persistenten Offset, der ab dann in jeden Frame einfliesst.
    map.on("zoom", (e: maplibregl.MapLibreEvent & { ghqAuto?: boolean }) => {
      if (e.ghqAuto || outroRef.current) return;
      const aktuell = map.getZoom();
      zoomOffsetRef.current = clamp(aktuell - (autoZoomRef.current ?? aktuell), -6, 6);
    });
    // Punkt erst nach dem Zeichnen setzen: jumpTo rechnet die Höhe des
    // Kartenmittelpunkts mit dem gebrochenen Zoom und bekommt dafür keine
    // DEM-Kachel (→ 0 m); korrigiert wird sie erst im Render. Ein 'move'-
    // Handler würde den Punkt deshalb über dem Gelände platzieren. 'render'
    // läuft nach jedem gezeichneten Frame — Punkt und Bild bleiben synchron.
    map.on("render", () => positioniereLaeufer(map));
    mapRef.current = map;
    // Debug-Hook: erlaubt Kamera-/Zoom-Messungen von aussen (Verifikation)
    (window as unknown as { __ghqMap?: maplibregl.Map }).__ghqMap = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("error", (e) => console.error("[maplibre]", e?.error ?? e));

    map.on("load", () => {
      aktiviere3D(map);
      fuegeRasterBasemapsHinzu(map);
      setzeKartenTyp(map, kartenTypRef.current, { nurBild: true });
      try {
        setzeRasterLod(map, 3, 2.5);
      } catch {
        /* rein Optimierung */
      }
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
          "line-opacity": 0.4,
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
      setzeLaeufer(map, koords[0]);
      setBereit(true);
    });

    /* Tile-Vorladen + erstes Idle → erst dann Play freigeben */
    let abgebrochen = false;
    const punkteFuerPrefetch = track.punkte.map((p) => ({ lng: p.lng, lat: p.lat }));
    const prefetch = prefetchFlyoverTiles(
      punkteFuerPrefetch,
      (p) => {
        if (!abgebrochen) setLadeProzent(Math.min(97, p));
      },
      {
        rasterTemplate: rasterTemplate(kartenTypRef.current),
        kameraZoom: kamera.zoomBase,
      }
    );
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

  /* Vollbild: MapLibre misst seinen Canvas nur bei resize() neu — ohne das
     bleibt die Karte nach dem Umschalten in der alten Grösse stehen.
     Bewusst als CSS-Overlay statt Fullscreen-API: die gibt es auf dem
     iPhone für einzelne Elemente nicht, und die App läuft als PWA. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(id);
  }, [vollbild]);

  /* Kartentyp umschalten (Sichtbarkeit, kein setStyle — sonst wären
     Terrain, Route und Läuferpunkt weg) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bereit) return;
    setzeKartenTyp(map, kartenTyp, { nurBild: true });
  }, [kartenTyp, bereit]);

  /** Gesamtbounds der Strecke — für Reset und Schlussfahrt */
  const streckenBounds = useCallback(() => {
    if (koords.length < 2) return null;
    return koords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(koords[0], koords[0])
    );
  }, [koords]);

  /**
   * Schlussfahrt: Nach dem letzten Frame aus der Verfolgerperspektive
   * herausziehen, bis die komplette Strecke im Bild ist. Der Trail bleibt
   * dabei vollständig eingefärbt stehen — man sieht am Ende, wo man war.
   */
  const zeigeGesamtstrecke = useCallback(
    (animiert = true) => {
      const map = mapRef.current;
      const bounds = streckenBounds();
      if (!map || !bounds) return;
      outroRef.current = true;
      map.fitBounds(
        bounds,
        {
          padding: { top: 56, bottom: 56, left: 36, right: 36 },
          pitch: 30,
          bearing: 0,
          duration: animiert ? 2600 : 0,
          essential: true,
        },
        { ghqAuto: true }
      );
      map.once("moveend", () => {
        outroRef.current = false;
        // Kamera-Glättung verwerfen: der nächste Start soll wieder am
        // Streckenanfang verankern statt vom Übersichtsbild loszuziehen
        kamLngRef.current = null;
        kamLatRef.current = null;
        kamPosVorRef.current = null;
        autoZoomRef.current = null;
        kamPitchRef.current = null;
      });
    },
    [streckenBounds]
  );

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

      // Position merken; gesetzt wird der Punkt im nächsten 'render'
      laeuferPosRef.current = [st.lng, st.lat];

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

      /* --- Weiche Verfolgerkamera ---
         1) Rohes Zielziel: aktuelle Position + leichtes lookAhead
         2) Position selbst tiefpassfiltern (grosse Zeitkonstante) — das
            ist der Kern der "grob und weich" gewünschten Bewegung
         3) Bearing NICHT aus dem rohen Track-Bearing, sondern aus der
            Bewegungsrichtung der bereits geglätteten Kameraposition
            ableiten und zusätzlich noch trägner nachziehen — dämpft
            GPS-Richtungsrauschen an der Quelle statt es nur zu kaschieren */
      const lookAhead = sampleAt(
        track,
        Math.min(track.totalDuration, st.tRel + 1.2 * k),
        undefined
      );
      const rohLng = st.lng + (lookAhead.lng - st.lng) * 0.35;
      const rohLat = st.lat + (lookAhead.lat - st.lat) * 0.35;

      let kamLng: number;
      let kamLat: number;
      if (kamLngRef.current == null || kamLatRef.current == null || sofort) {
        kamLng = rohLng;
        kamLat = rohLat;
      } else {
        const alphaPos = 1 - Math.exp(-dtS / KAM_TAU_POSITION_S);
        kamLng = kamLngRef.current + (rohLng - kamLngRef.current) * alphaPos;
        kamLat = kamLatRef.current + (rohLat - kamLatRef.current) * alphaPos;
      }
      kamLngRef.current = kamLng;
      kamLatRef.current = kamLat;

      const vorPos = kamPosVorRef.current ?? { lng: kamLng, lat: kamLat };
      const bewegungM = haversineM(vorPos.lat, vorPos.lng, kamLat, kamLng);
      if (bewegungM > 0.4) {
        const rohBearing = bearingGrad(vorPos.lat, vorPos.lng, kamLat, kamLng);
        if (sofort) {
          kamBearingRef.current = rohBearing;
        } else {
          const alphaBearing = 1 - Math.exp(-dtS / KAM_TAU_BEARING_S);
          kamBearingRef.current += wrapDelta(rohBearing - kamBearingRef.current) * alphaBearing;
        }
      }
      if (!Number.isFinite(kamBearingRef.current)) kamBearingRef.current = 0;
      kamPosVorRef.current = { lng: kamLng, lat: kamLat };

      // Speed-gekoppelter Basis-Zoom/Pitch, ebenfalls weich nachgezogen
      const speedNorm = Math.min(
        1,
        Math.max(0, (st.speed - track.speedP10) / (track.speedP90 - track.speedP10))
      );
      const zielZoomAuto = kamera.zoomBase - (speedNorm - 0.5) * 0.5;
      const zielPitch = kamera.pitchBase + speedNorm * 5;
      const alphaCam = sofort ? 1 : 1 - Math.exp(-dtS / KAM_TAU_ZOOM_PITCH_S);
      const autoZoom =
        autoZoomRef.current == null ? zielZoomAuto : autoZoomRef.current + (zielZoomAuto - autoZoomRef.current) * alphaCam;
      const pitch =
        kamPitchRef.current == null ? zielPitch : kamPitchRef.current + (zielPitch - kamPitchRef.current) * alphaCam;
      autoZoomRef.current = autoZoom;
      kamPitchRef.current = pitch;

      // Persistenter Nutzer-Zoom-Offset (Pinch/Wheel/+−-Tasten) fliesst
      // in jeden Frame ein, statt vom nächsten Auto-Update überschrieben
      // zu werden
      const finalZoom = clamp(autoZoom + zoomOffsetRef.current, ZOOM_MIN, ZOOM_MAX);

      // Geländehöhe unter dem Kameraziel explizit mitgeben: jumpTo sucht sie
      // sonst mit dem gebrochenen Zoom (z. B. 14.27), findet dazu keine
      // DEM-Kachel und setzt 0 m. Bei sich ständig änderndem Zoom sitzt die
      // Kamera dann im Berg — das Terrain blieb im Flug schwarz bzw. ruckelte,
      // erst im Stillstand war das Bild wieder da. Ganzzahliger Zoom trifft
      // die geladenen DEM-Kacheln (Suche fällt notfalls auf Elternkacheln).
      const hoehe = map.terrain?.getElevationForLngLatZoom(
        new maplibregl.LngLat(kamLng, kamLat),
        Math.floor(finalZoom)
      );
      map.jumpTo(
        {
          center: [kamLng, kamLat],
          bearing: ((kamBearingRef.current % 360) + 360) % 360,
          pitch,
          zoom: finalZoom,
          ...(hoehe != null && Number.isFinite(hoehe) ? { elevation: hoehe } : {}),
        },
        { ghqAuto: true }
      );

      /* HUD (gedrosselt ~5/s): REALwerte, nie Videogeschwindigkeit.
         Direkt ins DOM geschrieben — ein setState hier liesse die ganze
         Flyover-Komponente fünfmal pro Sekunde neu rendern. */
      if (sofort || jetzt - hudDrosselRef.current > 180) {
        hudDrosselRef.current = jetzt;
        schreibeHud(st);
      }
    },
    [track, k, kamera, schreibeHud]
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
        profil.dauerS
      );
      tVideoRef.current = tVideo;
      const st = sampleAt(track, tVideo * k, cursorRef.current);
      renderZustand(st, dtS);

      if (tVideo >= profil.dauerS) {
        spieltRef.current = false;
        setSpielt(false);
        zeigeGesamtstrecke();
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    },
    [track, k, renderZustand, profil, zeigeGesamtstrecke]
  );

  const play = useCallback(() => {
    if (!track) return;
    if (tVideoRef.current >= profil.dauerS) {
      // Replay: Kamera-Glättung neu verankern, sonst zieht sie vom
      // Streckenende quer über die Karte zurück zum Start
      startMsRef.current = null;
      pausedAccumRef.current = 0;
      tVideoRef.current = 0;
      cursorRef.current.idx = 0;
      kamLngRef.current = null;
      kamLatRef.current = null;
      kamPosVorRef.current = null;
      autoZoomRef.current = null;
      kamPitchRef.current = null;
    } else if (pauseBeginnRef.current != null) {
      pausedAccumRef.current += (performance.now() - pauseBeginnRef.current) / 1000;
      pauseBeginnRef.current = null;
    }
    const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduziert) {
      // Ohne Animation: direkt das Endbild — Trail komplett, Strecke ganz im Bild
      tVideoRef.current = profil.dauerS;
      renderZustand(sampleAt(track, track.totalDuration), 1, true);
      zeigeGesamtstrecke(false);
      return;
    }
    spieltRef.current = true;
    setSpielt(true);
    letzterFrameMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
  }, [track, frame, renderZustand, profil, zeigeGesamtstrecke]);

  const pause = useCallback(() => {
    spieltRef.current = false;
    setSpielt(false);
    pauseBeginnRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
  }, []);

  const seek = useCallback(
    (tVideo: number) => {
      if (!track) return;
      const t = Math.min(profil.dauerS, Math.max(0, tVideo));
      tVideoRef.current = t;
      cursorRef.current.idx = 0;
      // Wanduhr neu verankern, damit Play nahtlos weiterläuft
      startMsRef.current = performance.now() - t * 1000;
      pausedAccumRef.current = 0;
      pauseBeginnRef.current = spieltRef.current ? null : performance.now();
      renderZustand(sampleAt(track, t * k, cursorRef.current), 0.016, true);
    },
    [track, k, renderZustand, profil]
  );
  seekRef.current = seek;

  const reset = useCallback(() => {
    pause();
    startMsRef.current = null;
    pausedAccumRef.current = 0;
    pauseBeginnRef.current = null;
    tVideoRef.current = 0;
    cursorRef.current.idx = 0;
    kamLngRef.current = null;
    kamLatRef.current = null;
    kamPosVorRef.current = null;
    kamBearingRef.current = 0;
    autoZoomRef.current = null;
    kamPitchRef.current = null;
    zoomOffsetRef.current = 0;
    outroRef.current = false;
    const map = mapRef.current;
    const bounds = streckenBounds();
    if (map && bounds) {
      map.fitBounds(bounds, { padding: 48, pitch: 0, bearing: 0 }, { ghqAuto: true });
      map.setPaintProperty(
        "progress-linie",
        "line-gradient",
        progressGradient(farbStopsRef.current, 1e-4) as never
      );
      setzeLaeufer(map, koords[0]);
    }
    if (hudElRef.current) hudElRef.current.hidden = true;
  }, [pause, koords, streckenBounds, setzeLaeufer]);

  /* Tastatur: Space = Play/Pause, Pfeile = ±1 s Videozeit */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Escape") {
        setVollbild(false);
      } else if (e.code === "Space") {
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

  if (!track || !graphDaten) {
    return (
      <div className={cn("flex h-64 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground", className)}>
        Keine verwertbaren GPS-Daten für diese Aktivität.
      </div>
    );
  }

  return (
    <div
      className={cn(
        vollbild
          ? "fixed inset-x-0 top-0 z-50 flex flex-col gap-2 bg-background p-2 pb-safe pt-safe"
          : "space-y-2",
        className
      )}
      // Höhe wie der App-Rahmen über --app-h statt inset-0/dvh: iOS
      // unterschätzt im PWA-Standalone die echte Viewport-Höhe
      style={vollbild ? { height: "var(--app-h, 100dvh)" } : undefined}
    >
      <div
        className={cn(
          "relative overflow-hidden border border-border",
          vollbild ? "min-h-0 flex-1 rounded-lg" : "h-80 rounded-xl md:h-105"
        )}
      >
        {/* Inline-Style: maplibre-gl.css setzt .maplibregl-map auf
            position:relative — Grösse deshalb hart vorgeben */}
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />

        {/* Läuferpunkt: per transform über der Karte positioniert */}
        <div ref={laeuferElRef} className={LAEUFER_KLASSEN} hidden />

        {/* HUD: Realzeit/Realpace + Zeitraffer-Hinweis. Inhalt schreibt
            schreibeHud() direkt — siehe renderZustand. Bewusst ohne
            backdrop-blur: der würde jeden Kartenframe ein zweites Mal
            weichzeichnen. */}
        <div
          ref={hudElRef}
          hidden
          className="stat-mono absolute left-2 top-2 z-[2] flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-background/90 px-3 py-1.5 text-xs"
        >
          <span ref={hudZeitRef} />
          <span ref={hudKmRef} />
          <span ref={hudPaceRef} />
          <span ref={hudEleRef} />
          <span ref={hudHrRef} />
          <span className="text-[10px] text-muted-foreground">
            {Math.max(1, Math.round(k))}× Zeitraffer
          </span>
        </div>

        {/* Vollbild — unter der Navigation rechts, gleiche Optik wie diese */}
        <button
          onClick={() => setVollbild((v) => !v)}
          aria-label={vollbild ? "Vollbild verlassen" : "Karte im Vollbild"}
          className="absolute right-2 top-23 flex size-9 items-center justify-center rounded-lg bg-background/85 backdrop-blur"
        >
          {vollbild ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>

        {/* Kartentyp — unten links, damit HUD und Navigation frei bleiben */}
        <div className="absolute bottom-2 left-2 flex rounded-lg bg-background/85 p-0.5 backdrop-blur">
          {KARTEN_TYPEN.map((t) => (
            <button
              key={t.id}
              onClick={() => setKartenTyp(t.id)}
              aria-pressed={kartenTyp === t.id}
              className={cn(
                "min-h-8 rounded-md px-2.5 text-[11px]",
                kartenTyp === t.id ? "bg-muted font-semibold" : "text-muted-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

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
          {profil.dauerS}-s-Flyover
          {profil.label !== "Lauf" ? ` · ${profil.label}` : ""} ·
          Tempoverhältnisse originalgetreu · zum Schluss Blick auf die ganze
          Strecke · Zoom mit Pinch/+−
          {track.pausenKomprimiert ? " · Pausen komprimiert" : ""}
        </span>
      </div>
    </div>
  );
}
