import { Abschnitt } from "@/components/ui/kachel";
import { InsightCards } from "@/components/dashboard/insight-cards";
import { TrendBereich } from "@/components/dashboard/trend-bereich";
import {
  AktivitaetenKompakt,
  Bereitschaft,
  Gesamtbilanz,
  Gesundheitswerte,
  GewichtKompakt,
  Kopf,
  WocheKompakt,
} from "@/components/dashboard/uebersicht";
import type { DashboardDaten } from "@/lib/server/dashboard-service";
import { formatDatumLang } from "@/lib/format";

/**
 * Dashboard als Gesundheitsübersicht („Understated Performance") ohne
 * Datenzugriff. Die reguläre Startseite (app/page.tsx) lädt `DashboardDaten`
 * aus der DB, die öffentliche Demo (app/demo/page.tsx) reicht fiktive Daten
 * herein. Server- und client-tauglich.
 *
 * Priorität: Readiness und Body Battery → weitere Gesundheitswerte → Schlaf →
 * letzte Aktivitäten → Woche, Gewicht und Entwicklung. Das nächste Training
 * steht bewusst nur im Plan.
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
  /** Abschnitt „Schlaf" (Server: Suspense + DB, Demo: fertige Daten) */
  schlafKachel: React.ReactNode;
  /** rechts im Kopf (Sync-Knopf) */
  kopfAktion?: React.ReactNode;
  /** unsichtbarer Aktualisierer (router.refresh) */
  aktualisierer?: React.ReactNode;
}) {
  const verlauf = d.gesundheitVerlauf ?? [];
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-5 pb-8 md:space-y-8 md:px-8 md:pt-8">
      {aktualisierer}

      <Kopf heute={heute} aktion={kopfAktion} />

      {!d.dbBereit && (
        <p className="rounded-md border border-status-orange/40 px-3 py-2 text-sm text-status-orange">
          Datenbank noch nicht erreichbar. <code>DATABASE_URL</code> setzen und die Migrationen anwenden — siehe README.
        </p>
      )}

      {/* Gesundheit — oben, sofort sichtbar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
        <Bereitschaft verlauf={verlauf} heute={heute} />
        <Gesundheitswerte verlauf={verlauf} heute={heute} tsb={d.tsbHeute} />
      </div>

      {/* Schlaf und letzte Aktivitäten */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        {schlafKachel}
        <AktivitaetenKompakt aktivitaeten={d.letzteAktivitaeten} heute={heute} />
      </div>

      {/* Weitere Statistiken */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <WocheKompakt woche={d.woche} vorwoche={d.vorwoche} fortschritt={d.wochenFortschritt} />
        <GewichtKompakt g={d.gewicht} heute={heute} />
      </div>

      <TrendBereich
        verlauf={d.verlauf}
        fitness={d.fitness}
        tsbHeute={d.tsbHeute}
        acwrHeute={d.acwrHeute}
        aerob={d.aerobeLeistung ?? null}
        heute={heute}
        konsistenz={d.konsistenz}
      />

      <Abschnitt titel="Zusammenhänge">
        <InsightCards />
      </Abschnitt>

      <Gesamtbilanz allTime={d.allTime} seitText={d.allTime.seit ? `seit ${formatDatumLang(d.allTime.seit)}` : null} />
    </div>
  );
}
