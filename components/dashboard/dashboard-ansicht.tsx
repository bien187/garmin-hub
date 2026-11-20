import { ArrowRight, BatteryMedium, Dumbbell, Lightbulb, Mountain, TrendingUp, Trophy, Waves } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { KachelKopf } from "@/components/ui/kachel";
import { AppLink as Link } from "@/components/basis-pfad";
import { ReadinessCard } from "@/components/dashboard/readiness-card";
import { FitnessChart } from "@/components/dashboard/fitness-chart";
import { InsightCards } from "@/components/dashboard/insight-cards";
import { PaceHrChart } from "@/components/dashboard/pace-hr-chart";
import { KonsistenzKachel } from "@/components/dashboard/konsistenz-kachel";
import { FortschrittChart } from "@/components/dashboard/fortschritt-chart";
import { GewichtKarte } from "@/components/dashboard/gewicht-karte";
import {
  Begruessung,
  Kennzahlen,
  LetzteAktivitaeten,
  NaechstesTraining,
  WochenUebersicht,
} from "@/components/dashboard/cockpit";
import { ZeitraumBereich, ZeitraumSpanne, ZeitraumTitel } from "@/components/dashboard/zeitraum-umschalter";
import { BodyMap } from "@/components/body/body-map";
import type { DashboardDaten } from "@/lib/server/dashboard-service";
import { motivation } from "@/lib/dashboard-texte";
import { formatDatumLang } from "@/lib/format";
import { tsbZone } from "@/lib/engine/fitness";

/**
 * Dashboard-Ansicht („Fitness-Cockpit") ohne Datenzugriff. Die reguläre
 * Startseite (app/page.tsx) lädt `DashboardDaten` aus der DB, die
 * öffentliche Demo (app/demo/page.tsx) reicht fiktive Daten herein.
 * Server- und client-tauglich.
 *
 * Aufbau: Begrüssung → nächstes Training → Kennzahlen der Woche →
 * Wochenübersicht + Fortschritt → letzte Aktivitäten, Bereitschaft, Schlaf,
 * Gewicht → persönliche Insights (Form, Pace bei gleichem Puls, Muskeln,
 * Konsistenz, Korrelationen) → Gesamtbilanz.
 */
export function DashboardAnsicht({
  d,
  heute,
  schlafKachel,
  kopfAktion,
  aktualisierer,
}: {
  d: DashboardDaten;
  heute: string;
  /** Kachel „Schlaf letzte Nacht" (Server: Suspense + DB, Demo: fertige Daten) */
  schlafKachel: React.ReactNode;
  /** rechts in der Begrüssung (Sync-Knopf) */
  kopfAktion?: React.ReactNode;
  /** unsichtbarer Aktualisierer (router.refresh) */
  aktualisierer?: React.ReactNode;
}) {
  const tsbInfo =
    d.tsbHeute == null
      ? null
      : ({
          frisch: { text: "frisch", farbe: "text-status-green" },
          produktiv: { text: "produktiv", farbe: "text-primary" },
          neutral: { text: "ermüdet", farbe: "text-status-yellow" },
          warnung: { text: "Warnung", farbe: "text-status-red" },
        }[tsbZone(d.tsbHeute)] ?? null);

  const satz = motivation({ heute, naechste: d.naechsteEinheit, fortschritt: d.wochenFortschritt });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-5 md:p-6 lg:p-8">
      {aktualisierer}

      {!d.dbBereit && (
        <Card className="border-status-orange/40 bg-status-orange/5">
          <CardContent className="text-sm">
            Datenbank noch nicht erreichbar. <code>DATABASE_URL</code> setzen und die Migrationen anwenden — siehe
            README.
          </CardContent>
        </Card>
      )}

      {/* A + E: Begrüssung und nächstes Training */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Begruessung
            name={d.profil.name ? d.profil.name.trim().split(/\s+/)[0] : null}
            heute={heute}
            satz={satz}
            block={d.block}
            serie={d.konsistenz?.serie ?? null}
            aktion={kopfAktion}
          />
        </div>
        <NaechstesTraining einheit={d.naechsteEinheit} heute={heute} />
      </div>

      {/* B: Kennzahlen der Woche */}
      <Kennzahlen woche={d.woche} vorwoche={d.vorwoche} fortschritt={d.wochenFortschritt} />

      {/* C + D: Woche und Fortschritt */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WochenUebersicht tage={d.wochenTage} heute={heute} fortschritt={d.wochenFortschritt} />
        <Card className="gh-auf lg:col-span-2">
          <KachelKopf icon={TrendingUp} ton="lime" titel="Fortschritt" untertitel="letzte 12 Wochen, aus deinen Aktivitäten" />
          <div className="px-(--card-spacing)">
            <FortschrittChart verlauf={d.verlauf} />
          </div>
        </Card>
      </div>

      {/* F + Tagesform: Aktivitäten, Bereitschaft, Schlaf, Gewicht */}
      <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <LetzteAktivitaeten aktivitaeten={d.letzteAktivitaeten} heute={heute} />
        <Card className="gh-auf">
          <KachelKopf icon={BatteryMedium} ton="lime" titel="Bereitschaft heute" />
          <div className="px-(--card-spacing)">
            <ReadinessCard daten={d.heuteHealth} />
          </div>
        </Card>
        {schlafKachel}

        {/* G: Persönliche Insights */}
        <ZeitraumBereich>
          <Card className="gh-auf md:col-span-2">
            <KachelKopf
              icon={Waves}
              ton="blau"
              titel={<ZeitraumTitel name="Form & Fitness" />}
              untertitel="CTL · ATL · TSB aus der Trainingsbelastung"
              aktion={
                d.tsbHeute != null ? (
                  <div className="text-right">
                    <div className="stat-display text-xl leading-none">
                      {d.tsbHeute > 0 ? "+" : ""}
                      {d.tsbHeute}
                    </div>
                    <div className={`text-[10px] font-medium tracking-[0.06em] uppercase ${tsbInfo?.farbe ?? "text-dim-foreground"}`}>
                      TSB · {tsbInfo?.text}
                    </div>
                  </div>
                ) : undefined
              }
            />
            <div className="px-(--card-spacing)">
              <FitnessChart daten={d.fitness} />
              {d.acwrHeute != null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  ACWR {d.acwrHeute.toFixed(2)}{" "}
                  {d.acwrHeute > 1.5
                    ? "— rote Zone, Verletzungsrisiko!"
                    : d.acwrHeute > 1.3
                      ? "— erhöht, Umfang beobachten"
                      : "— im Sweet Spot (0.8–1.3)"}
                </p>
              )}
            </div>
          </Card>
        </ZeitraumBereich>

        <GewichtKarte g={d.gewicht} heute={heute} />

        <ZeitraumBereich>
          <Card className="gh-auf md:col-span-2">
            <KachelKopf
              icon={Mountain}
              ton="coral"
              titel={<ZeitraumTitel name="Pace bei gleichem Puls" />}
              untertitel={
                <>
                  Median je Woche bei {d.paceFortschritt.refHr ?? "–"} bpm · höhenkorrigiert ·{" "}
                  <ZeitraumSpanne start={d.trainingsstart} heute={heute} />
                </>
              }
            />
            <div className="space-y-2 px-(--card-spacing)">
              <PaceHrChart wochen={d.paceFortschritt.wochen} refHr={d.paceFortschritt.refHr} />
              <p className="text-xs text-muted-foreground">
                {d.paceFortschritt.letzteMessung
                  ? `Letzte Messung: ${formatDatumLang(d.paceFortschritt.letzteMessung)}. `
                  : ""}
                Linie steigt = bei gleichem Puls schneller unterwegs — der verlässlichste Beleg, dass die Ausdauer
                wächst.
              </p>
            </div>
          </Card>
        </ZeitraumBereich>

        <Card className="gh-auf">
          <KachelKopf
            icon={Dumbbell}
            ton="lime"
            titel="Muskelstatus"
            aktion={
              <Link href="/body" className="flex min-h-11 items-center gap-1 text-xs font-medium text-primary">
                Körper <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="flex justify-center px-(--card-spacing)">
            <Link href="/body" className="block w-full" aria-label="Muskelstatus im Körper-Tab öffnen">
              <BodyMap werte={d.muskelnHeute} mini className="h-44" />
            </Link>
          </div>
        </Card>

        {/* Korrelations-Insights */}
        <Card className="gh-auf md:col-span-2">
          <KachelKopf icon={Lightbulb} ton="violett" titel="Insights" untertitel="Zusammenhänge in deinen Daten" />
          <div className="px-(--card-spacing)">
            <InsightCards />
          </div>
        </Card>

        {d.konsistenz && (
          <Card className="gh-auf">
            <KachelKopf icon={TrendingUp} ton="lime" titel="Konsistenz" untertitel="Trainingsstunden · 12 Wochen" />
            <div className="px-(--card-spacing)">
              <KonsistenzKachel k={d.konsistenz} />
            </div>
          </Card>
        )}
      </div>

      {/* Gesamtbilanz */}
      <Card className="gh-auf">
        <KachelKopf
          icon={Trophy}
          ton="coral"
          titel="Gesamtbilanz"
          untertitel={d.allTime.seit ? `seit ${formatDatumLang(d.allTime.seit)}` : undefined}
        />
        <div className="grid grid-cols-3 gap-2 px-(--card-spacing) sm:grid-cols-6">
          <AllTimeWert label="Distanz" wert={d.allTime.distanzKm} einheit="km" />
          <AllTimeWert label="davon Laufen" wert={d.allTime.laufKm} einheit="km" />
          <AllTimeWert label="Höhenmeter" wert={d.allTime.hm} einheit="Hm" />
          <AllTimeWert label="Trainingszeit" wert={d.allTime.stunden} einheit="h" />
          <AllTimeWert label="Aktivitäten" wert={d.allTime.aktivitaeten} einheit="" />
          <AllTimeWert label="Längster Lauf" wert={d.allTime.laengsterLaufKm} einheit="km" />
        </div>
      </Card>
    </div>
  );
}

function AllTimeWert({ label, wert, einheit }: { label: string; wert: number; einheit: string }) {
  return (
    <div className="rounded-xl bg-surface p-2.5">
      <div className="truncate text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className="stat-display text-[19px] leading-tight">
        {wert.toLocaleString("de-CH")}
        {einheit && <span className="ml-1 text-xs font-normal text-muted-foreground">{einheit}</span>}
      </div>
    </div>
  );
}
