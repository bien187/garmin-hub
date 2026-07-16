"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowLeftRight,
  Download,
  Eraser,
  Flame,
  Layers,
  Redo2,
  RotateCw,
  Save,
  Send,
  Undo2,
  Mountain,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { aktiviere3D, BASEMAP_STYLE, deaktiviere3D } from "@/lib/geo/map-style";
import { gapFaktor } from "@/lib/engine/gap";
import { decodePolyline } from "@/lib/geo/polyline";
import { geojsonZuGpx } from "@/lib/geo/gpx";
import { formatDauer, formatKm, formatPace } from "@/lib/format";
import { cn } from "@/lib/utils";

type Koord = [number, number, number?]; // lng, lat, ele

interface Zustand {
  wegpunkte: [number, number][];
  segmente: Koord[][]; // segment[i] verbindet wegpunkt i → i+1
}

interface GespeicherteRoute {
  id: string;
  name: string;
  distanzM: number;
  hmAuf: number;
  garminCourseId: number | null;
  geojson: { geometry: { coordinates: Koord[] } };
}

async function routeBrouter(a: [number, number], b: [number, number]): Promise<Koord[]> {
  const url = `https://brouter.de/brouter?lonlats=${a[0].toFixed(6)},${a[1].toFixed(6)}|${b[0].toFixed(6)},${b[1].toFixed(6)}&profile=trekking&alternativeidx=0&format=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BRouter ${res.status}`);
  const data = await res.json();
  const coords = data?.features?.[0]?.geometry?.coordinates as Koord[] | undefined;
  if (!coords || coords.length < 2) throw new Error("BRouter: leere Route");
  return coords;
}

function statistik(segmente: Koord[][]) {
  let dist = 0;
  let hmAuf = 0;
  let hmAb = 0;
  let gapDist = 0;
  for (const seg of segmente) {
    for (let i = 1; i < seg.length; i++) {
      const [lng1, lat1, e1] = seg[i - 1];
      const [lng2, lat2, e2] = seg[i];
      const dx = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
      const dy = (lat2 - lat1) * 110_540;
      const d = Math.hypot(dx, dy);
      dist += d;
      let steigung = 0;
      if (e1 != null && e2 != null && d > 1) {
        const dh = e2 - e1;
        if (dh > 0) hmAuf += dh;
        else hmAb -= dh;
        steigung = dh / d;
      }
      gapDist += d * gapFaktor(steigung);
    }
  }
  return { dist, hmAuf, hmAb, gapDist };
}

export function RouteBuilder() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker[]>([]);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const zustandRef = useRef<Zustand>({ wegpunkte: [], segmente: [] });
  const undoRef = useRef<Zustand[]>([]);
  const redoRef = useRef<Zustand[]>([]);

  const [bereit, setBereit] = useState(false);
  const [ist3D, setIst3D] = useState(false);
  const [luftlinie, setLuftlinie] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [stats, setStats] = useState({ dist: 0, hmAuf: 0, hmAb: 0, gapDist: 0 });
  const [anzahlWegpunkte, setAnzahlWegpunkte] = useState(0);
  const [z2PaceSKm, setZ2PaceSKm] = useState(430);
  const [profilPunkte, setProfilPunkte] = useState<{ distKm: number; ele: number; lng: number; lat: number }[]>([]);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [routenName, setRoutenName] = useState("");
  const [gespeicherte, setGespeicherte] = useState<GespeicherteRoute[]>([]);
  const [zeigeGespeicherte, setZeigeGespeicherte] = useState(false);
  const [zeigeHeatmap, setZeigeHeatmap] = useState(false);
  const luftlinieRef = useRef(false);
  luftlinieRef.current = luftlinie;

  /* ---------- Rendering des Builder-Zustands auf die Karte ---------- */
  const zeichne = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = zustandRef.current;
    const alleKoords: Koord[] = z.segmente.flat();
    (map.getSource("builder-route") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: alleKoords.map(([lng, lat]) => [lng, lat]),
      },
    });

    // Marker neu setzen
    markerRef.current.forEach((m) => m.remove());
    markerRef.current = z.wegpunkte.map((wp, i) => {
      const el = document.createElement("div");
      el.className =
        "size-5 rounded-full border-2 border-white shadow cursor-grab " +
        (i === 0 ? "bg-status-green" : i === z.wegpunkte.length - 1 ? "bg-status-red" : "bg-primary");
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(wp)
        .addTo(map);
      marker.on("dragend", () => {
        const neu = marker.getLngLat();
        verschiebeWegpunkt(i, [neu.lng, neu.lat]);
      });
      return marker;
    });

    const s = statistik(z.segmente);
    setStats(s);
    setAnzahlWegpunkte(z.wegpunkte.length);

    // Höhenprofil-Punkte
    let dist = 0;
    const pp: { distKm: number; ele: number; lng: number; lat: number }[] = [];
    let vorher: Koord | null = null;
    for (const k of alleKoords) {
      if (vorher) {
        const dx = (k[0] - vorher[0]) * 111_320 * Math.cos((k[1] * Math.PI) / 180);
        const dy = (k[1] - vorher[1]) * 110_540;
        dist += Math.hypot(dx, dy);
      }
      vorher = k;
      if (k[2] != null) pp.push({ distKm: dist / 1000, ele: k[2], lng: k[0], lat: k[1] });
    }
    setProfilPunkte(pp.filter((_, i) => i % Math.max(1, Math.floor(pp.length / 300)) === 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useCallback(() => {
    undoRef.current.push(structuredClone(zustandRef.current));
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  const segment = useCallback(
    async (a: [number, number], b: [number, number]): Promise<Koord[]> => {
      if (luftlinieRef.current) return [a, b];
      try {
        return await routeBrouter(a, b);
      } catch {
        setMeldung("BRouter nicht erreichbar — Luftlinie als Fallback verwendet.");
        return [a, b];
      }
    },
    []
  );

  const fuegeWegpunktHinzu = useCallback(
    async (wp: [number, number]) => {
      snapshot();
      setLaedt(true);
      const z = zustandRef.current;
      const neu: Zustand = {
        wegpunkte: [...z.wegpunkte, wp],
        segmente: [...z.segmente],
      };
      if (z.wegpunkte.length > 0) {
        const letzte = z.wegpunkte[z.wegpunkte.length - 1];
        neu.segmente.push(await segment(letzte, wp));
      }
      zustandRef.current = neu;
      setLaedt(false);
      zeichne();
    },
    [segment, snapshot, zeichne]
  );

  const verschiebeWegpunkt = useCallback(
    async (index: number, wp: [number, number]) => {
      snapshot();
      setLaedt(true);
      const z = structuredClone(zustandRef.current);
      z.wegpunkte[index] = wp;
      if (index > 0) z.segmente[index - 1] = await segment(z.wegpunkte[index - 1], wp);
      if (index < z.wegpunkte.length - 1) {
        z.segmente[index] = await segment(wp, z.wegpunkte[index + 1]);
      }
      zustandRef.current = z;
      setLaedt(false);
      zeichne();
    },
    [segment, snapshot, zeichne]
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(structuredClone(zustandRef.current));
    zustandRef.current = prev;
    zeichne();
  }, [zeichne]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(structuredClone(zustandRef.current));
    zustandRef.current = next;
    zeichne();
  }, [zeichne]);

  const rueckweg = useCallback(() => {
    const z = zustandRef.current;
    if (z.wegpunkte.length < 2) return;
    snapshot();
    const gespiegelteSegmente = [...z.segmente]
      .reverse()
      .map((s) => [...s].reverse());
    zustandRef.current = {
      wegpunkte: [...z.wegpunkte, ...[...z.wegpunkte].reverse().slice(1)],
      segmente: [...z.segmente, ...gespiegelteSegmente],
    };
    zeichne();
  }, [snapshot, zeichne]);

  const schliesseRundkurs = useCallback(async () => {
    const z = zustandRef.current;
    if (z.wegpunkte.length < 2) return;
    await fuegeWegpunktHinzu(z.wegpunkte[0]);
  }, [fuegeWegpunktHinzu]);

  const leeren = useCallback(() => {
    snapshot();
    zustandRef.current = { wegpunkte: [], segmente: [] };
    zeichne();
  }, [snapshot, zeichne]);

  /* ---------- Karte ---------- */
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [8.1787, 47.3855], // Lenzburg
      zoom: 13,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: false }),
      "top-right"
    );

    map.on("load", () => {
      map.addSource("builder-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "builder-linie",
        type: "line",
        source: "builder-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 4.5, "line-color": "#2ee6c7" },
      });
      map.addSource("gespeicherte", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "gespeicherte-linien",
        type: "line",
        source: "gespeicherte",
        paint: { "line-width": 3, "line-color": "#7aa2f7", "line-opacity": 0.75 },
        layout: { visibility: "none" },
      });
      map.addSource("heatmap", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer(
        {
          id: "heatmap-linien",
          type: "line",
          source: "heatmap",
          paint: { "line-width": 2, "line-color": "#ff7043", "line-opacity": 0.18 },
          layout: { visibility: "none" },
        },
        "builder-linie"
      );
      setBereit(true);
    });

    map.on("click", (e) => {
      fuegeWegpunktHinzu([e.lngLat.lng, e.lngLat.lat]);
    });

    return () => {
      markerRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Modell-Pace laden */
  useEffect(() => {
    fetch("/api/model")
      .then((r) => r.json())
      .then((d) => setZ2PaceSKm((d.paces.z2.von + d.paces.z2.bis) / 2))
      .catch(() => {});
    fetch("/api/courses")
      .then((r) => r.json())
      .then((d) => setGespeicherte(d.courses ?? []))
      .catch(() => {});
  }, []);

  /* 3D-Toggle */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bereit) return;
    if (ist3D) {
      aktiviere3D(map);
      map.easeTo({ pitch: 62, duration: 700 });
    } else {
      deaktiviere3D(map);
      map.easeTo({ pitch: 0, duration: 500 });
    }
  }, [ist3D, bereit]);

  /* Gespeicherte Routen + Heatmap Layer */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bereit) return;
    map.setLayoutProperty(
      "gespeicherte-linien",
      "visibility",
      zeigeGespeicherte ? "visible" : "none"
    );
    if (zeigeGespeicherte) {
      (map.getSource("gespeicherte") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: gespeicherte.map((g) => ({
          type: "Feature" as const,
          properties: { name: g.name },
          geometry: {
            type: "LineString" as const,
            coordinates: g.geojson.geometry.coordinates.map(([lng, lat]) => [lng, lat]),
          },
        })),
      });
    }
  }, [zeigeGespeicherte, gespeicherte, bereit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bereit) return;
    map.setLayoutProperty("heatmap-linien", "visibility", zeigeHeatmap ? "visible" : "none");
    if (zeigeHeatmap) {
      fetch("/api/activities/polylines")
        .then((r) => r.json())
        .then((d) => {
          const features = (d.polylines as string[]).map((p) => ({
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: decodePolyline(p).map(([lat, lng]) => [lng, lat]),
            },
          }));
          (map.getSource("heatmap") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features,
          });
        })
        .catch(() => {});
    }
  }, [zeigeHeatmap, bereit]);

  /* Hover Höhenprofil ↔ Kartenmarker */
  const zeigeHover = useCallback((p: { lng: number; lat: number } | null) => {
    const map = mapRef.current;
    if (!map) return;
    if (!p) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }
    if (!hoverMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "size-3 rounded-full bg-white ring-2 ring-primary";
      hoverMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat([p.lng, p.lat]);
    }
  }, []);

  /* Speichern / Push / GPX */
  const speichern = useCallback(async () => {
    const koords = zustandRef.current.segmente.flat();
    if (koords.length < 2 || !routenName.trim()) return;
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: routenName.trim(),
        geojson: {
          type: "Feature",
          properties: { name: routenName.trim() },
          geometry: { type: "LineString", coordinates: koords },
        },
        distanzM: stats.dist,
        hmAuf: stats.hmAuf,
        hmAb: stats.hmAb,
      }),
    });
    if (res.ok) {
      setDialogOffen(false);
      setRoutenName("");
      setMeldung("Route gespeichert.");
      fetch("/api/courses")
        .then((r) => r.json())
        .then((d) => setGespeicherte(d.courses ?? []));
    } else {
      setMeldung("Speichern fehlgeschlagen.");
    }
  }, [routenName, stats]);

  const pushe = useCallback(async (id: string) => {
    setMeldung("Sende an Garmin…");
    const res = await fetch(`/api/courses/${id}/push`, { method: "POST" });
    const data = await res.json();
    setMeldung(res.ok ? data.hinweis : (data.error ?? "Push fehlgeschlagen"));
    if (res.ok) {
      fetch("/api/courses")
        .then((r) => r.json())
        .then((d) => setGespeicherte(d.courses ?? []));
    }
  }, []);

  const gpxDownload = useCallback((name: string, koords: Koord[]) => {
    const gpx = geojsonZuGpx(name, koords);
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replaceAll(/\s+/g, "_")}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const dauerS = (stats.gapDist / 1000) * z2PaceSKm;

  return (
    <div className="relative h-[calc(100dvh-52px)] w-full md:h-dvh">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Toolbar oben links */}
      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <IconBtn onClick={undo} title="Rückgängig">
            <Undo2 className="size-4" />
          </IconBtn>
          <IconBtn onClick={redo} title="Wiederholen">
            <Redo2 className="size-4" />
          </IconBtn>
          <IconBtn onClick={rueckweg} title="Rückweg anhängen (umkehren)">
            <ArrowLeftRight className="size-4" />
          </IconBtn>
          <IconBtn onClick={schliesseRundkurs} title="Rundkurs schliessen">
            <RotateCw className="size-4" />
          </IconBtn>
          <IconBtn onClick={leeren} title="Leeren">
            <Eraser className="size-4" />
          </IconBtn>
        </div>
        <div className="flex gap-1.5">
          <IconBtn
            onClick={() => setIst3D((v) => !v)}
            title="2D/3D"
            aktiv={ist3D}
          >
            <Mountain className="size-4" />
          </IconBtn>
          <IconBtn
            onClick={() => setLuftlinie((v) => !v)}
            title="Luftlinien-Modus"
            aktiv={luftlinie}
          >
            <span className="text-[10px] font-bold">LL</span>
          </IconBtn>
          <IconBtn
            onClick={() => setZeigeGespeicherte((v) => !v)}
            title="Gespeicherte Routen"
            aktiv={zeigeGespeicherte}
          >
            <Layers className="size-4" />
          </IconBtn>
          <IconBtn
            onClick={() => setZeigeHeatmap((v) => !v)}
            title="Heatmap aller Aktivitäten"
            aktiv={zeigeHeatmap}
          >
            <Flame className="size-4" />
          </IconBtn>
        </div>
      </div>

      {/* Statuszeile + Aktionen unten */}
      <div className="absolute inset-x-2 bottom-2 z-10 space-y-1.5 md:inset-x-auto md:left-2 md:w-95">
        {meldung && (
          <div
            className="cursor-pointer rounded-lg bg-background/90 px-3 py-2 text-xs backdrop-blur"
            onClick={() => setMeldung(null)}
          >
            {meldung}
          </div>
        )}
        <div className="rounded-xl border border-border bg-background/90 p-3 backdrop-blur">
          <div className="stat-mono flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="stat-display text-xl">{formatKm(stats.dist)}</span>
            <span>↑ {Math.round(stats.hmAuf)} m</span>
            <span>↓ {Math.round(stats.hmAb)} m</span>
            <span title={`GAP-basiert bei Z2 (${formatPace(z2PaceSKm)})`}>
              ≈ {formatDauer(dauerS)}
            </span>
            {laedt && <span className="text-xs text-primary">routet…</span>}
          </div>

          {profilPunkte.length > 4 && (
            <div className="mt-2 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={profilPunkte}
                  margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                  onMouseMove={(st) => {
                    const payload = (
                      st as unknown as {
                        activePayload?: { payload: (typeof profilPunkte)[number] }[];
                      }
                    )?.activePayload;
                    if (payload?.[0]) zeigeHover(payload[0].payload);
                  }}
                  onMouseLeave={() => zeigeHover(null)}
                >
                  <XAxis dataKey="distKm" hide type="number" domain={[0, "dataMax"]} />
                  <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof profilPunkte)[number];
                      return (
                        <div className="stat-mono rounded bg-popover px-2 py-1 text-[10px]">
                          km {p.distKm.toFixed(1)} · {Math.round(p.ele)} m
                        </div>
                      );
                    }}
                  />
                  <Area
                    dataKey="ele"
                    stroke="var(--chart-2)"
                    fill="var(--chart-2)"
                    fillOpacity={0.3}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              disabled={anzahlWegpunkte < 2}
              onClick={() => setDialogOffen(true)}
            >
              <Save className="size-4" /> Speichern
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={anzahlWegpunkte < 2}
              onClick={() => gpxDownload("grenadier-route", zustandRef.current.segmente.flat())}
            >
              <Download className="size-4" /> GPX
            </Button>
          </div>
        </div>

        {/* Gespeicherte Routen */}
        {zeigeGespeicherte && gespeicherte.length > 0 && (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border bg-background/90 p-2 backdrop-blur">
            {gespeicherte.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.name}</div>
                  <div className="stat-mono text-muted-foreground">
                    {formatKm(g.distanzM)} · ↑{Math.round(g.hmAuf)} m
                    {g.garminCourseId ? " · auf Garmin" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => pushe(g.id)}>
                    <Send className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => gpxDownload(g.name, g.geojson.geometry.coordinates)}
                  >
                    <Download className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Speichern-Dialog */}
      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Route speichern</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="z.B. Goffersberg-Runde"
            value={routenName}
            onChange={(e) => setRoutenName(e.target.value)}
            autoFocus
          />
          <p className="stat-mono text-xs text-muted-foreground">
            {formatKm(stats.dist)} · ↑{Math.round(stats.hmAuf)} m · ↓
            {Math.round(stats.hmAb)} m
          </p>
          <DialogFooter>
            <Button onClick={speichern} disabled={!routenName.trim()}>
              <Save className="size-4" /> Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  aktiv,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  aktiv?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex size-10 items-center justify-center rounded-lg border border-border bg-background/90 backdrop-blur transition-colors hover:bg-muted",
        aktiv && "border-primary bg-primary/15 text-primary"
      )}
    >
      {children}
    </button>
  );
}
