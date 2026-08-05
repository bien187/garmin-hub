"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BodyMap, ReliefLegende } from "./body-map";
import { MiniSparkline } from "@/components/dashboard/fitness-chart";
import {
  gelaendeFarbe,
  MUSKEL_NAME,
  MuskelId,
} from "@/lib/engine/muscle";
import { acwrZone, tsbZone } from "@/lib/engine/fitness";
import { formatDatumLang, isoDatum } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BodyDaten {
  heute: Record<string, number>;
  belastbarInH: Record<string, number>;
  sparklines: Record<string, { datum: string; wert: number }[]>;
  beitraege: {
    activityId: number;
    name: string | null;
    typ: string;
    startZeit: string;
    lasten: Partial<Record<MuskelId, number>>;
  }[];
  systemisch: {
    tsb: number | null;
    acwr: number | null;
    hrvTrend: { datum: string; hrv: number | null }[];
  };
}

export function BodyTab() {
  const [daten, setDaten] = useState<BodyDaten | null>(null);
  const [ausgewaehlt, setAusgewaehlt] = useState<MuskelId | null>(null);

  useEffect(() => {
    fetch("/api/body")
      .then((r) => r.json())
      .then(setDaten)
      .catch(() => setDaten(null));
  }, []);

  const beitraegeFuer = useMemo(() => {
    if (!daten || !ausgewaehlt) return [];
    return daten.beitraege
      .filter((b) => (b.lasten[ausgewaehlt] ?? 0) > 1)
      .sort((a, b) => (b.lasten[ausgewaehlt] ?? 0) - (a.lasten[ausgewaehlt] ?? 0));
  }, [daten, ausgewaehlt]);

  if (!daten) {
    return (
      <div className="space-y-3">
        <div className="h-105 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  const wert = ausgewaehlt ? (daten.heute[ausgewaehlt] ?? 0) : 0;
  const tsbInfo = daten.systemisch.tsb != null ? tsbZone(daten.systemisch.tsb) : null;
  const acwrInfo = acwrZone(daten.systemisch.acwr);
  const hrvWerte = daten.systemisch.hrvTrend.filter((h) => h.hrv != null);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-2">
          <BodyMap
            werte={daten.heute as Partial<Record<MuskelId, number>>}
            onSelect={setAusgewaehlt}
            ausgewaehlt={ausgewaehlt}
          />
          {/* Kartenlegende: Liniendichte = Belastung */}
          <div className="mt-3">
            <ReliefLegende />
          </div>
          <p className="mt-2 text-center text-[11px] text-text-dim">
            Dichte der Höhenlinien = Belastung. Modellschätzung, kein Messwert.
          </p>
        </CardContent>
      </Card>

      {/* Systemische Ermüdung */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="micro-label">
            Systemische Ermüdung
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">TSB</div>
            <div
              className={cn(
                "stat-display text-2xl",
                tsbInfo === "warnung" && "text-status-red",
                tsbInfo === "frisch" && "text-status-green"
              )}
            >
              {daten.systemisch.tsb != null
                ? `${daten.systemisch.tsb > 0 ? "+" : ""}${Math.round(daten.systemisch.tsb)}`
                : "–"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {tsbInfo === "warnung"
                ? "< −20: Erholung!"
                : tsbInfo === "frisch"
                  ? "frisch"
                  : tsbInfo === "produktiv"
                    ? "produktiv"
                    : "ermüdet"}
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ACWR</div>
            <div
              className={cn(
                "stat-display text-2xl",
                acwrInfo === "gefahr" && "text-status-red",
                acwrInfo === "erhoeht" && "text-status-orange",
                acwrInfo === "sweetspot" && "text-status-green"
              )}
            >
              {daten.systemisch.acwr?.toFixed(2) ?? "–"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {acwrInfo === "gefahr"
                ? "> 1.5 Verletzungswarnung!"
                : acwrInfo === "erhoeht"
                  ? "erhöht"
                  : acwrInfo === "sweetspot"
                    ? "Sweet Spot"
                    : acwrInfo === "unter"
                      ? "unterfordert"
                      : "zu wenig Daten"}
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              HRV 7 Tage
            </div>
            {hrvWerte.length >= 2 ? (
              <MiniSparkline
                daten={hrvWerte as unknown as Record<string, unknown>[]}
                dataKey="hrv"
              />
            ) : (
              <div className="stat-display text-2xl">–</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom-Sheet pro Muskel — nicht-modal, damit der Körper sichtbar
          und klickbar bleibt (Muskel-Wechsel ohne Schliessen) */}
      <Sheet
        modal={false}
        open={ausgewaehlt != null}
        onOpenChange={(o) => !o && setAusgewaehlt(null)}
      >
        <SheetContent
          side="bottom"
          overlay={false}
          className="max-h-[55dvh] overflow-y-auto border-t-2 border-primary/30 pb-safe"
          onInteractOutside={(e) => {
            // Klick auf die Body-Map: Muskel wechseln statt schliessen
            if ((e.target as HTMLElement | null)?.closest("svg")) e.preventDefault();
          }}
        >
          {ausgewaehlt && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2.5">
                  <span
                    className="size-3.5 rounded-full"
                    style={{ background: gelaendeFarbe(wert) }}
                  />
                  {MUSKEL_NAME[ausgewaehlt]}
                </SheetTitle>
                <SheetDescription>
                  Rest-Erschöpfung {Math.round(wert)} % ·{" "}
                  {wert <= 20
                    ? "voll belastbar"
                    : `voll belastbar in ~${daten.belastbarInH[ausgewaehlt] ?? 0} h`}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                {(daten.sparklines[ausgewaehlt]?.length ?? 0) >= 2 && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Verlauf 14 Tage</div>
                    <MiniSparkline
                      daten={
                        daten.sparklines[ausgewaehlt] as unknown as Record<string, unknown>[]
                      }
                      dataKey="wert"
                      farbe={gelaendeFarbe(wert)}
                    />
                  </div>
                )}
                <div>
                  <div className="mb-1.5 text-xs text-muted-foreground">
                    Beiträge der letzten 7 Tage
                  </div>
                  {beitraegeFuer.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Keine nennenswerte Belastung in den letzten 7 Tagen.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {beitraegeFuer.map((b) => (
                      <div
                        key={b.activityId}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate">{b.name ?? b.typ}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatDatumLang(isoDatum(new Date(b.startZeit)))}
                          </div>
                        </div>
                        <span className="stat-mono ml-3 shrink-0 text-xs">
                          +{Math.round(b.lasten[ausgewaehlt] ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
