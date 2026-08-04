"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActivityDelete } from "../use-activity-delete";
import { FlyoverApi, FlyoverMap, FlyoverStreams } from "./flyover-map";
import { FlyoverGraph } from "./flyover-graph";
import { ElevationChart } from "./elevation-chart";
import { FLYOVER_DAUER_S } from "@/lib/engine/flyover";
import { BodyMap } from "@/components/body/body-map";
import { lastenAusKraft, MUSKEL_NAME, MuskelId } from "@/lib/engine/muscle";
import {
  formatDauer,
  formatDatumLang,
  formatKm,
  formatNote,
  formatPace,
  isoDatum,
} from "@/lib/format";

interface DetailDaten {
  aktivitaet: {
    id: number;
    typ: string;
    name: string | null;
    startZeit: string;
    dauerS: number;
    distanzM: number | null;
    hmAuf: number | null;
    hmAb: number | null;
    avgHr: number | null;
    maxHr: number | null;
    avgPace: number | null;
    kalorien: number | null;
    trainingseffektAerob: number | null;
    vo2maxWert: number | null;
  };
  streams: FlyoverStreams | null;
  saetze: {
    id: string;
    uebungName: string;
    saetze: number;
    wdh: number | null;
    gewichtKg: number | null;
    muskelgruppen: string[];
  }[];
  metriken: {
    gapPaceSKm: number | null;
    istPaceSKm: number | null;
    entkopplung: number | null;
    effizienzIndex: number | null;
    zonenZeit: { zone: string; sekunden: number }[] | null;
    splits: { km: number; zeitS: number; paceSKm: number; hmAuf: number }[];
  };
}

const ZONEN_FARBEN: Record<string, string> = {
  Z1: "var(--chart-5)",
  Z2: "var(--status-green)",
  Z3: "var(--status-yellow)",
  Z4: "var(--status-orange)",
  Z5: "var(--status-red)",
};

export function ActivityDetail({ id }: { id: string }) {
  const router = useRouter();
  const loeschen = useActivityDelete();
  const [daten, setDaten] = useState<DetailDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [flyover, setFlyover] = useState<FlyoverApi | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);

  useEffect(() => {
    fetch(`/api/activities/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Fehler");
        return r.json();
      })
      .then(setDaten)
      .catch((e) => setFehler(e.message));
  }, [id]);

  if (fehler) {
    return <p className="p-6 text-sm text-status-red">{fehler}</p>;
  }
  if (!daten) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted/50" />
        <div className="h-80 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  const a = daten.aktivitaet;
  const m = daten.metriken;
  const istKraftTyp = a.typ.includes("strength") || a.typ.includes("fitness");
  const zonenGesamt = m.zonenZeit?.reduce((s, z) => s + z.sekunden, 0) ?? 0;

  /* Muskel-Lasten dieser Kraft-Einheit für die Mini-Body-Map */
  const kraftLasten = istKraftTyp
    ? lastenAusKraft(
        daten.saetze.map((s) => ({
          uebungKey: s.uebungName,
          saetze: s.saetze,
          wdh: s.wdh,
          gewichtKg: s.gewichtKg,
        })),
        88
      )
    : {};

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            {formatDatumLang(isoDatum(new Date(a.startZeit)))} · {a.typ}
          </div>
          <h1 className="stat-display text-2xl uppercase tracking-wide">
            {a.name ?? a.typ}
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Aktivität löschen"
          className="shrink-0 text-status-red hover:bg-status-red/10"
          onClick={() => setLoeschenOffen(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Dialog open={loeschenOffen} onOpenChange={setLoeschenOffen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aktivität aus dem Hub entfernen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            «{a.name ?? a.typ}» wird nur hier ausgeblendet. Bei Garmin Connect
            bleibt sie bestehen. Rückgängig direkt danach möglich.
          </p>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLoeschenOffen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-status-red/50 text-status-red hover:bg-status-red/10"
              onClick={() => {
                setLoeschenOffen(false);
                loeschen(a.id, {
                  onRestore: () => router.push(`/activities/${a.id}`),
                });
                router.push("/activities");
              }}
            >
              Entfernen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kernmetriken */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Dauer" wert={formatDauer(a.dauerS)} />
        {a.distanzM != null && a.distanzM > 100 && (
          <Stat label="Distanz" wert={formatKm(a.distanzM)} />
        )}
        {m.istPaceSKm != null && !istKraftTyp && (
          <Stat label="Pace" wert={formatPace(m.istPaceSKm)} />
        )}
        {m.gapPaceSKm != null && <Stat label="GAP" wert={formatPace(m.gapPaceSKm)} hebe />}
        {a.avgHr != null && <Stat label="Ø HR" wert={`${Math.round(a.avgHr)}`} />}
        {a.hmAuf != null && a.hmAuf > 10 && (
          <Stat label="Aufstieg" wert={`${Math.round(a.hmAuf)} m`} />
        )}
        {a.kalorien != null && <Stat label="kcal" wert={`${Math.round(a.kalorien)}`} />}
        {m.effizienzIndex != null && (
          <Stat label="EF" wert={m.effizienzIndex.toFixed(2)} hebe />
        )}
        {m.entkopplung != null && (
          <Stat
            label="Entkopplung"
            wert={`${(m.entkopplung * 100).toFixed(1)} %`}
            farbe={m.entkopplung < 0.05 ? "text-status-green" : "text-status-orange"}
          />
        )}
        {a.vo2maxWert != null && <Stat label="VO₂max" wert={formatNote(a.vo2maxWert)} />}
      </div>

      {/* 3D-Flyover */}
      {daten.streams && (
        <FlyoverMap streams={daten.streams} onBereit={setFlyover} />
      )}

      {/* Verlaufsgraph (Höhe + Herzfrequenz + Pace) unter der Karte.
          Läuft der Flyover, wandert der Indikator synchron mit; scrubben
          steuert die Kamera. Fallback auf das statische Höhenprofil, wenn
          die Flyover-Engine (noch) keinen Track liefert. */}
      {daten.streams && !istKraftTyp && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Verlauf {flyover ? "· Höhe · Herzfrequenz · Pace" : "· Höhenprofil"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flyover ? (
              <FlyoverGraph
                track={flyover.track}
                daten={flyover.graphDaten}
                tVideoRef={flyover.tVideoRef}
                videoDauerS={FLYOVER_DAUER_S}
                onScrub={flyover.seek}
                heightPx={132}
              />
            ) : (
              <ElevationChart streams={daten.streams} />
            )}
          </CardContent>
        </Card>
      )}

      {/* HR-Zonen */}
      {m.zonenZeit && zonenGesamt > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Herzfrequenz-Zonen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {m.zonenZeit.map((z) => (
              <div key={z.zone} className="flex items-center gap-2 text-xs">
                <span className="w-6 font-medium">{z.zone}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(z.sekunden / zonenGesamt) * 100}%`,
                      background: ZONEN_FARBEN[z.zone],
                    }}
                  />
                </div>
                <span className="stat-mono w-14 text-right text-muted-foreground">
                  {formatDauer(z.sekunden)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Splits */}
      {m.splits.length > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Splits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-normal">km</th>
                  <th className="py-1 font-normal">Pace</th>
                  <th className="py-1 text-right font-normal">Hm</th>
                  <th className="w-1/2 py-1 pl-3 font-normal" />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const schnellste = Math.min(...m.splits.map((s) => s.paceSKm));
                  return m.splits.map((s) => (
                    <tr key={s.km} className="border-t border-border/60">
                      <td className="stat-mono py-1">{s.km}</td>
                      <td className="stat-mono py-1">{formatPace(s.paceSKm)}</td>
                      <td className="stat-mono py-1 text-right text-muted-foreground">
                        {s.hmAuf > 0 ? `+${s.hmAuf}` : "–"}
                      </td>
                      <td className="py-1 pl-3">
                        <div
                          className="h-2 rounded bg-primary/70"
                          style={{ width: `${Math.max(8, (schnellste / s.paceSKm) * 100)}%` }}
                        />
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Krafttraining: Sätze + belastete Muskeln */}
      {istKraftTyp && daten.saetze.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Sätze
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 font-normal">Übung</th>
                    <th className="py-1 text-right font-normal">Wdh</th>
                    <th className="py-1 text-right font-normal">kg</th>
                  </tr>
                </thead>
                <tbody>
                  {daten.saetze.map((s) => (
                    <tr key={s.id} className="border-t border-border/60">
                      <td className="py-1.5">
                        {s.uebungName.replaceAll("_", " ").toLowerCase()}
                      </td>
                      <td className="stat-mono py-1.5 text-right">{s.wdh ?? "–"}</td>
                      <td className="stat-mono py-1.5 text-right">
                        {s.gewichtKg != null ? s.gewichtKg.toFixed(0) : "KG"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Belastete Muskeln
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BodyMap werte={kraftLasten} mini className="h-44" />
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(kraftLasten)
                  .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                  .slice(0, 6)
                  .map(([id, last]) => (
                    <span
                      key={id}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {MUSKEL_NAME[id as MuskelId]} {Math.round(last ?? 0)}
                    </span>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  wert,
  hebe,
  farbe,
}: {
  label: string;
  wert: string;
  hebe?: boolean;
  farbe?: string;
}) {
  return (
    <div
      className={`rounded-lg p-2.5 ${hebe ? "bg-primary/10 ring-1 ring-primary/25" : "bg-muted/50"}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`stat-display text-lg leading-tight ${farbe ?? ""}`}>{wert}</div>
    </div>
  );
}
