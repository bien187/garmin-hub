"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoDeaktiviert, useAppPfad, useIstDemo } from "@/components/basis-pfad";
import { RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ConfirmSheet } from "@/components/ui/sheet-confirm";
import { useActivityDelete } from "../use-activity-delete";
import { FlyoverApi, FlyoverMap, FlyoverStreams } from "./flyover-map";
import { hatKoordinaten } from "@/lib/engine/flyover";
import { FlyoverGraph } from "./flyover-graph";
import { ElevationChart } from "./elevation-chart";
import { BodyMap } from "@/components/body/body-map";
import {
  lastenAusKraft,
  lastenAusTemplate,
  MUSKEL_NAME,
  MUSKEL_TEMPLATES,
  MuskelId,
} from "@/lib/engine/muscle";
import type { ZonenSatz } from "@/lib/hr-zonen";
import {
  formatDauer,
  formatDatumLang,
  formatKm,
  formatNote,
  formatPace,
  isoDatum,
} from "@/lib/format";
import { cn } from "@/lib/utils";

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
    syncedAt: string | null;
    manualMuscleTemplate: string | null;
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
    zonen: ZonenSatz | null;
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
  const pfad = useAppPfad();
  const demo = useIstDemo();
  const loeschen = useActivityDelete();
  const toast = useToast();
  const [daten, setDaten] = useState<DetailDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [flyover, setFlyover] = useState<FlyoverApi | null>(null);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [aktualisiert, setAktualisiert] = useState(false);

  const ladeDetail = useCallback(async () => {
    const r = await fetch(`/api/activities/${id}`);
    if (!r.ok) throw new Error((await r.json()).error ?? "Fehler");
    return (await r.json()) as DetailDaten;
  }, [id]);

  useEffect(() => {
    ladeDetail()
      .then(setDaten)
      .catch((e) => setFehler(e.message));
  }, [ladeDetail]);

  async function setzeTemplate(template: string | null) {
    // optimistisch
    setDaten((d) => (d ? { ...d, aktivitaet: { ...d.aktivitaet, manualMuscleTemplate: template } } : d));
    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualMuscleTemplate: template }),
    }).catch(() => null);
    if (res && res.ok) {
      setDaten(await ladeDetail());
      toast({ message: template ? "Template zugewiesen." : "Template entfernt." });
    } else {
      toast({ message: "Konnte Template nicht speichern.", variant: "error" });
    }
  }

  async function aktualisieren() {
    setAktualisiert(true);
    try {
      const res = await fetch(`/api/activities/${id}/resync`, { method: "POST" });
      const d = await res.json();
      if (d.code === "not_found_at_garmin") {
        toast({
          message: "Bei Garmin nicht mehr vorhanden.",
          actionLabel: "Aus Hub entfernen",
          onAction: () => {
            loeschen(Number(id));
            router.push(pfad("/activities"));
          },
        });
        return;
      }
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Fehler");
      setDaten(await ladeDetail());
      toast({ message: "Aktivität aktualisiert." });
    } catch {
      toast({ message: "Aktualisieren fehlgeschlagen.", variant: "error" });
    } finally {
      setAktualisiert(false);
    }
  }

  if (fehler) {
    return <p className="p-6 text-sm text-status-red">{fehler}</p>;
  }
  if (!daten) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const a = daten.aktivitaet;
  const m = daten.metriken;
  const istKraftTyp = a.typ.includes("strength") || a.typ.includes("fitness");
  const zonenGesamt = m.zonenZeit?.reduce((s, z) => s + z.sekunden, 0) ?? 0;
  const hatStrecke = hatKoordinaten(daten.streams);

  /* Muskel-Lasten dieser Kraft-Einheit für die Mini-Body-Map.
     Manuelles Template hat Vorrang vor der Ableitung aus den Sätzen. */
  const kraftLasten = !istKraftTyp
    ? {}
    : a.manualMuscleTemplate
      ? lastenAusTemplate(a.manualMuscleTemplate, 60)
      : daten.saetze.length > 0
        ? lastenAusKraft(
            daten.saetze.map((s) => ({
              uebungKey: s.uebungName,
              saetze: s.saetze,
              wdh: s.wdh,
              gewichtKg: s.gewichtKg,
            })),
            88
          )
        : lastenAusTemplate("ganzkoerper", 55);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-dim-foreground">
            {formatDatumLang(isoDatum(new Date(a.startZeit)))} · {a.typ}
          </div>
          <h1 className="stat-display text-xl uppercase tracking-[0.03em]">
            {a.name ?? a.typ}
          </h1>
          <div className="stat-mono mt-0.5 text-[10px] text-dim-foreground">
            {a.syncedAt
              ? `zuletzt synchronisiert · ${new Date(a.syncedAt).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "noch nicht einzeln aktualisiert"}
          </div>
        </div>
        {/* Aktualisieren/Löschen gibt es in der Demo nicht */}
        {!demo && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Von Garmin aktualisieren"
            disabled={aktualisiert}
            onClick={aktualisieren}
            className="flex size-11 items-center justify-center rounded-lg"
          >
            <RefreshCw className={cn("size-4.5", aktualisiert && "gh-spin")} />
          </button>
          <button
            aria-label="Aktivität löschen"
            onClick={() => setLoeschenOffen(true)}
            className="flex size-11 items-center justify-center rounded-lg text-status-red"
          >
            <Trash2 className="size-4.5" />
          </button>
        </div>
        )}
      </div>

      <ConfirmSheet
        open={loeschenOffen}
        onClose={() => setLoeschenOffen(false)}
        title="Aktivität aus dem Hub entfernen?"
        description={
          <>
            «{a.name ?? a.typ}» wird nur hier ausgeblendet. Bei Garmin Connect
            bleibt sie bestehen. Rückgängig direkt danach möglich.
          </>
        }
        confirmLabel="Entfernen"
        danger
        onConfirm={() => {
          loeschen(a.id, {
            onRestore: () => router.push(pfad(`/activities/${a.id}`)),
          });
          router.push(pfad("/activities"));
        }}
      />

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

      {/* 3D-Flyover — nur wenn die Aktivität überhaupt eine Strecke hat.
          Halleneinheiten liefern für lat/lng JSON-null statt eines Arrays. */}
      {hatStrecke && (
        <FlyoverMap streams={daten.streams!} typ={a.typ} onBereit={setFlyover} />
      )}

      {/* Verlaufsgraph (Höhe + Herzfrequenz + Pace) unter der Karte.
          Läuft der Flyover, wandert der Indikator synchron mit; scrubben
          steuert die Kamera. Fallback auf das statische Höhenprofil, wenn
          die Flyover-Engine (noch) keinen Track liefert. */}
      {hatStrecke && !istKraftTyp && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Verlauf {flyover ? "· Höhe · Herzfrequenz · Pace" : "· Höhenprofil"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flyover ? (
              <FlyoverGraph
                track={flyover.track}
                daten={flyover.graphDaten}
                tVideoRef={flyover.tVideoRef}
                videoDauerS={flyover.videoDauerS}
                onScrub={flyover.seek}
                heightPx={132}
              />
            ) : (
              <ElevationChart streams={daten.streams!} />
            )}
          </CardContent>
        </Card>
      )}

      {/* HR-Zonen */}
      {m.zonenZeit && zonenGesamt > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Herzfrequenz-Zonen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {m.zonenZeit.map((z) => {
              const grenze = m.zonen?.[z.zone.toLowerCase() as "z1"];
              return (
                <div key={z.zone} className="flex items-center gap-2 text-xs">
                  <span className="w-6 font-medium">{z.zone}</span>
                  {grenze && (
                    <span className="stat-mono w-16 text-[10px] text-dim-foreground">
                      {grenze.von}–{grenze.bis}
                    </span>
                  )}
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
              );
            })}
            <p className="pt-0.5 text-[10px] text-muted-foreground">
              {m.zonen?.quelle === "garmin"
                ? `Zonengrenzen aus Garmin (${m.zonen.sport}) — identisch mit der Uhr.`
                : "Karvonen-Schätzung — für identische Grenzen wie auf der Uhr die Zonen unter Einstellungen von Garmin holen."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Splits */}
      {m.splits.length > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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

      {/* Krafttraining: manuelles Muskel-Template (überschreibt Ableitung) */}
      {istKraftTyp && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Muskel-Template
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              {daten.saetze.length > 0
                ? "Überschreibt die aus den Sätzen abgeleitete Belastung."
                : "Keine Übungsdetails von Garmin — weise die Belastung manuell zu."}
            </p>
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5">
              <button
                disabled={demo}
                onClick={() => setzeTemplate(null)}
                className={cn(
                  "min-h-11 rounded-md px-3 text-[13px]",
                  a.manualMuscleTemplate == null
                    ? "bg-background font-semibold"
                    : "text-muted-foreground"
                )}
              >
                Automatisch
              </button>
              {MUSKEL_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  disabled={demo}
                  onClick={() => setzeTemplate(t.id)}
                  className={cn(
                    "min-h-11 rounded-md px-3 text-[13px]",
                    a.manualMuscleTemplate === t.id
                      ? "bg-background font-semibold"
                      : "text-muted-foreground"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {demo && <DemoDeaktiviert className="mt-2" />}
          </CardContent>
        </Card>
      )}

      {/* Krafttraining: Sätze + belastete Muskeln */}
      {istKraftTyp && daten.saetze.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
              <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
      className={`rounded-md p-2.5 ${hebe ? "bg-primary/10 ring-1 ring-primary/25" : "bg-muted"}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`stat-display text-[17px] leading-tight ${farbe ?? ""}`}>{wert}</div>
    </div>
  );
}
