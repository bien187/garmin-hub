import Link from "next/link";
import { ArrowRight, CalendarRange, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountdownHero } from "@/components/dashboard/countdown-hero";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { ReadinessCard } from "@/components/dashboard/readiness-card";
import { FitnessChart } from "@/components/dashboard/fitness-chart";
import { EpWidget } from "@/components/dashboard/ep-widget";
import { SyncButton } from "@/components/dashboard/sync-button";
import { InsightCards } from "@/components/dashboard/insight-cards";
import { PaceHrChart } from "@/components/dashboard/pace-hr-chart";
import { BodyMap } from "@/components/body/body-map";
import { ladeDashboard } from "@/lib/server/dashboard-service";
import { aktuellePhase, epCountdown } from "@/lib/ep/phasen";
import { formatDatumLang, formatDauer, formatKm, heuteIso } from "@/lib/format";
import { tsbZone } from "@/lib/engine/fitness";

export const dynamic = "force-dynamic";

const TITEL_KLASSE =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

export default async function DashboardPage() {
  const d = await ladeDashboard();
  const heute = heuteIso();
  const countdown = epCountdown(heute, d.profil.epDatum);
  const phase = aktuellePhase(heute, d.profil.epDatum);

  const tsbInfo =
    d.tsbHeute == null
      ? null
      : ({
          frisch: { text: "frisch", farbe: "text-status-green" },
          produktiv: { text: "produktiv", farbe: "text-primary" },
          neutral: { text: "ermüdet", farbe: "text-status-yellow" },
          warnung: { text: "Warnung", farbe: "text-status-red" },
        }[tsbZone(d.tsbHeute)] ?? null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Kopfzeile: EP-Countdown — das Signatur-Element (Hero-Zahl) */}
      <div className="flex items-start justify-between gap-3">
        <CountdownHero
          wochen={countdown.wochen}
          tage={countdown.tage}
          vorbei={countdown.vorbei}
          phaseNr={phase.nr}
          phaseName={phase.name}
          epDatumLang={formatDatumLang(d.profil.epDatum)}
        />
        <SyncButton kompakt />
      </div>

      {!d.dbBereit && (
        <Card className="border-status-orange/40 bg-status-orange/5">
          <CardContent className="py-4 text-sm">
            Datenbank noch nicht erreichbar. <code>DATABASE_URL</code> setzen und{" "}
            <code>pnpm db:push</code> ausführen — siehe README.
          </CardContent>
        </Card>
      )}

      {/* Reihenfolge der Kacheln ist im Bearbeiten-Modus frei sortierbar
          und liegt serverseitig, damit sie auf allen Geräten gleich ist. */}
      <DashboardGrid
        reihenfolge={d.layout}
        kacheln={[
          {
            id: "bereitschaft",
            titel: "Bereitschaft heute",
            span: 1,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>Bereitschaft heute</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReadinessCard daten={d.heuteHealth} />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "ep_prognose",
            titel: "EP-Notenprognose",
            span: 2,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>EP-Notenprognose</CardTitle>
                </CardHeader>
                <CardContent>
                  <EpWidget prognose={d.epPrognose} />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "fitness",
            titel: "Fitness · 90 Tage",
            span: 2,
            inhalt: (
              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className={TITEL_KLASSE}>Fitness · 90 Tage</CardTitle>
                  {d.tsbHeute != null && (
                    <div className="flex items-baseline gap-1.5 text-right">
                      <span className="stat-display text-xl">
                        {d.tsbHeute > 0 ? "+" : ""}
                        {d.tsbHeute}
                      </span>
                      <span
                        className={`text-[10px] font-medium uppercase tracking-[0.06em] ${tsbInfo?.farbe ?? "text-dim-foreground"}`}
                      >
                        TSB · {tsbInfo?.text}
                      </span>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <FitnessChart daten={d.fitness} />
                  {d.acwrHeute != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      ACWR {d.acwrHeute.toFixed(2)}{" "}
                      {d.acwrHeute > 1.5
                        ? "— rote Zone, Verletzungsrisiko!"
                        : d.acwrHeute > 1.3
                          ? "— erhöht, Umfang beobachten"
                          : "— im Sweet Spot (0.8–1.3)"}
                    </p>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "pace_fortschritt",
            titel: "Fortschritt · Pace bei gleichem Puls",
            span: 2,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>
                    Fortschritt · Pace bei gleichem Puls
                  </CardTitle>
                  <p className="text-[10px] text-dim-foreground">
                    Median-Pace bei {d.paceFortschritt.refHr ?? "–"} bpm · je Woche ·
                    höhenkorrigiert
                  </p>
                </CardHeader>
                <CardContent>
                  <PaceHrChart
                    wochen={d.paceFortschritt.wochen}
                    refHr={d.paceFortschritt.refHr}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Linie steigt = bei gleichem Puls schneller unterwegs. Das ist der
                    verlässlichste Beleg dafür, dass die Grundlage wächst.
                  </p>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "muskelstatus",
            titel: "Muskelstatus",
            span: 1,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>Muskelstatus</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2">
                  <Link href="/body" className="block w-full">
                    <BodyMap werte={d.muskelnHeute} mini className="h-40" />
                  </Link>
                  <Link
                    href="/body"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Details im Körper-Tab <ArrowRight className="size-3" />
                  </Link>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "diese_woche",
            titel: "Diese Woche",
            span: 1,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>Diese Woche</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <WochenWert
                      label="Lauf-km"
                      wert={d.woche.km}
                      vorwoche={d.vorwoche.km}
                      einheit="km"
                    />
                    <WochenWert
                      label="Höhenmeter"
                      wert={d.woche.hm}
                      vorwoche={d.vorwoche.hm}
                      einheit="Hm"
                    />
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "letzte_aktivitaet",
            titel: "Letzte Aktivität",
            span: 1,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>Letzte Aktivität</CardTitle>
                </CardHeader>
                <CardContent>
                  {d.letzteAktivitaet ? (
                    <Link
                      href={`/activities/${d.letzteAktivitaet.id}`}
                      className="block rounded-lg bg-muted p-3 transition-colors hover:bg-muted"
                    >
                      <div className="truncate font-medium">
                        {d.letzteAktivitaet.name ?? d.letzteAktivitaet.typ}
                      </div>
                      <div className="stat-mono mt-1 text-sm text-muted-foreground">
                        {formatDauer(d.letzteAktivitaet.dauerS)}
                        {d.letzteAktivitaet.distanzM
                          ? ` · ${formatKm(d.letzteAktivitaet.distanzM)}`
                          : ""}
                      </div>
                    </Link>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Noch keine Aktivitäten.
                    </p>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "naechstes_training",
            titel: "Nächstes Training",
            span: 1,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>Nächstes Training</CardTitle>
                </CardHeader>
                <CardContent>
                  {d.naechsteEinheit ? (
                    <Link
                      href="/plan"
                      className="block rounded-lg bg-muted p-3 transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarRange className="size-3.5" />
                        {formatDatumLang(d.naechsteEinheit.datum)}
                      </div>
                      <div className="mt-1 truncate font-medium">
                        {d.naechsteEinheit.titel}
                      </div>
                    </Link>
                  ) : (
                    <Link href="/plan" className="text-sm text-primary hover:underline">
                      Noch kein Plan — jetzt Woche generieren
                    </Link>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "all_time",
            titel: "All Time",
            span: 3,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>All Time</CardTitle>
                  {d.allTime.seit && (
                    <p className="text-[10px] text-dim-foreground">
                      seit {formatDatumLang(d.allTime.seit)}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    <AllTimeWert label="Distanz" wert={d.allTime.distanzKm} einheit="km" />
                    <AllTimeWert
                      label="davon Laufen"
                      wert={d.allTime.laufKm}
                      einheit="km"
                    />
                    <AllTimeWert label="Höhenmeter" wert={d.allTime.hm} einheit="Hm" />
                    <AllTimeWert
                      label="Trainingszeit"
                      wert={d.allTime.stunden}
                      einheit="h"
                    />
                    <AllTimeWert
                      label="Aktivitäten"
                      wert={d.allTime.aktivitaeten}
                      einheit=""
                    />
                    <AllTimeWert
                      label="Längster Lauf"
                      wert={d.allTime.laengsterLaufKm}
                      einheit="km"
                    />
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "insights",
            titel: "Insights",
            span: 3,
            inhalt: (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className={TITEL_KLASSE}>Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <InsightCards />
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

function AllTimeWert({
  label,
  wert,
  einheit,
}: {
  label: string;
  wert: number;
  einheit: string;
}) {
  return (
    <div className="rounded-md bg-muted p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="stat-display text-[19px] leading-tight">
        {wert.toLocaleString("de-CH")}
        {einheit && <span className="ml-1 text-xs text-muted-foreground">{einheit}</span>}
      </div>
    </div>
  );
}

function WochenWert({
  label,
  wert,
  vorwoche,
  einheit,
}: {
  label: string;
  wert: number;
  vorwoche: number;
  einheit: string;
}) {
  const diff = vorwoche > 0 ? ((wert - vorwoche) / vorwoche) * 100 : null;
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="stat-display text-2xl">
        {wert}
        <span className="ml-1 text-sm text-muted-foreground">{einheit}</span>
      </div>
      {diff != null && (
        <div
          className={`flex items-center gap-1 text-xs ${diff >= 0 ? "text-status-green" : "text-status-orange"}`}
        >
          {diff >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(0)} % vs. Vorwoche
        </div>
      )}
    </div>
  );
}
