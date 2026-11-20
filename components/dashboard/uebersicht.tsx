import { AppLink as Link } from "@/components/basis-pfad";
import { Abschnitt } from "@/components/ui/kachel";
import { SportIcon } from "@/components/sport-icon";
import { MiniLinie, kgDelta } from "@/components/dashboard/gewicht-karte";
import type { AllTimeStats, DashboardAktivitaet } from "@/lib/server/dashboard-service";
import type { GewichtKurz } from "@/lib/server/gewicht-service";
import type { Wochenwerte } from "@/lib/engine/wochenstatistik";
import {
  bereitschaft,
  bodyBatteryStufe,
  hrvStufe,
  readinessStufe,
  stressStufe,
  trend,
  type Einstufung,
  type TagesGesundheit,
} from "@/lib/engine/gesundheit";
import { tsbZone } from "@/lib/engine/fitness";
import { sportName } from "@/lib/engine/sport";
import {
  formatDauer,
  formatPaceKurz,
  formatStundenMinuten,
  jetztMs,
  relativerTag,
  stundeZuerich,
  tageszeitGruss,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const TON: Record<Einstufung["ton"], string> = {
  gut: "text-status-green",
  mittel: "text-status-yellow",
  tief: "text-status-orange",
  neutral: "text-muted-foreground",
};

const Leer = () => <span className="text-dim-foreground">–</span>;

/** „↑ 6 vs. Ø 7 T" — nur wenn ein Vergleich mit den sieben Vortagen möglich ist */
function TrendText({ diff, einheit = "" }: { diff: number | null; einheit?: string }) {
  if (diff == null) return <span className="text-dim-foreground">kein 7-Tage-Vergleich</span>;
  if (diff === 0) return <span>wie Ø 7 T</span>;
  return (
    <span>
      {diff > 0 ? "↑" : "↓"} {Math.abs(diff)}
      {einheit} vs. Ø 7 T
    </span>
  );
}

/** Zahl mit echtem Minuszeichen und Vorzeichen bei positiven Werten */
const mitVorzeichen = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/* ------------------------------------------------------------------ */
/* Kopf                                                                */
/* ------------------------------------------------------------------ */

export function Kopf({ heute, aktion }: { heute: string; aktion?: React.ReactNode }) {
  const gruss = tageszeitGruss(stundeZuerich(jetztMs()));
  const datum = new Date(heute + "T12:00:00").toLocaleDateString("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[24px] leading-tight font-medium tracking-tight md:text-[28px]">{gruss}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">{datum}</p>
      </div>
      {aktion}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Readiness & Body Battery                                            */
/* ------------------------------------------------------------------ */

function Skala({ wert, von, ton }: { wert: number | null; von?: number | null; ton: "primary" | "blau" }) {
  const w = wert != null ? Math.max(0, Math.min(100, wert)) : 0;
  const v = von != null ? Math.max(0, Math.min(w, von)) : 0;
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden>
      {wert != null && (
        <div
          className={cn("absolute inset-y-0 rounded-full", ton === "primary" ? "bg-primary" : "bg-blau")}
          style={{ left: `${v}%`, width: `${w - v}%` }}
        />
      )}
    </div>
  );
}

export function Bereitschaft({ verlauf, heute }: { verlauf: TagesGesundheit[]; heute: string }) {
  const tag = verlauf.find((t) => t.datum === heute) ?? null;
  const tr = trend(verlauf, heute, "readiness");
  const bb = trend(verlauf, heute, "bodyBatteryMax");
  const rStufe = readinessStufe(tr.wert);
  const bStufe = bodyBatteryStufe(bb.wert);
  const einschaetzung = bereitschaft({
    readiness: tr.wert,
    bodyBatteryMax: bb.wert,
    hrvStatus: tag?.hrvStatus ?? null,
    schlafScore: tag?.schlafScore ?? null,
  });
  const punkt =
    einschaetzung.ampel === "gruen"
      ? "bg-status-green"
      : einschaetzung.ampel === "gelb"
        ? "bg-status-yellow"
        : einschaetzung.ampel === "rot"
          ? "bg-status-red"
          : "bg-dim-foreground";

  return (
    <section className="rounded-xl border border-border/70 bg-card" aria-label="Training Readiness und Body Battery">
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="space-y-2.5 p-4 md:p-5">
          <div className="text-xs text-muted-foreground">Training Readiness</div>
          <div className="flex items-baseline gap-2">
            <span className="stat-display text-[34px] leading-none">{tr.wert != null ? Math.round(tr.wert) : <Leer />}</span>
            {rStufe && <span className={cn("text-sm", TON[rStufe.ton])}>{rStufe.label}</span>}
          </div>
          <Skala wert={tr.wert} ton="primary" />
          <div className="text-xs text-muted-foreground">
            <TrendText diff={tr.diff} />
          </div>
        </div>
        <div className="space-y-2.5 p-4 md:p-5">
          <div className="text-xs text-muted-foreground">Body Battery · Höchstwert</div>
          <div className="flex items-baseline gap-2">
            <span className="stat-display text-[34px] leading-none">{bb.wert != null ? Math.round(bb.wert) : <Leer />}</span>
            {bStufe && <span className={cn("text-sm", TON[bStufe.ton])}>{bStufe.label}</span>}
          </div>
          <Skala wert={bb.wert} von={tag?.bodyBatteryMin ?? null} ton="blau" />
          <div className="text-xs text-muted-foreground">
            {tag?.bodyBatteryMin != null ? `Tagestief ${Math.round(tag.bodyBatteryMin)} · ` : ""}
            <TrendText diff={bb.diff} />
          </div>
        </div>
      </div>
      <p className="flex items-start gap-2.5 border-t border-border px-4 py-3 text-[13px] leading-snug text-foreground/85 md:px-5">
        <span className={cn("mt-[5px] size-2 shrink-0 rounded-full", punkt)} aria-hidden />
        {einschaetzung.satz}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Weitere Gesundheitsdaten                                            */
/* ------------------------------------------------------------------ */

function Kennwert({
  label,
  wert,
  einheit,
  fuss,
}: {
  label: string;
  wert: React.ReactNode;
  einheit?: string;
  fuss: React.ReactNode;
}) {
  return (
    <div className="min-w-0 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="stat-display text-[22px] leading-none">{wert}</span>
        {einheit && <span className="text-xs text-muted-foreground">{einheit}</span>}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{fuss}</div>
    </div>
  );
}

export function Gesundheitswerte({
  verlauf,
  heute,
  tsb,
}: {
  verlauf: TagesGesundheit[];
  heute: string;
  tsb: number | null;
}) {
  const tag = verlauf.find((t) => t.datum === heute) ?? null;
  const rhr = trend(verlauf, heute, "ruhepuls");
  const hrv = trend(verlauf, heute, "hrv");
  const stress = trend(verlauf, heute, "stress");
  const hStufe = hrvStufe(tag?.hrvStatus ?? null);
  const sStufe = stressStufe(stress.wert);
  const form =
    tsb == null
      ? null
      : ({ frisch: "frisch", produktiv: "produktiv", neutral: "ermüdet", warnung: "stark ermüdet" } as const)[tsbZone(tsb)];

  return (
    // 2 × 2 auf dem Handy und neben der Readiness (lg), dazwischen eine Reihe mit 4 Spalten;
    // eine Trennlinie nur zwischen den Zeilen
    <section
      aria-label="Weitere Gesundheitswerte"
      className="grid grid-cols-2 content-start gap-x-6 md:grid-cols-4 lg:grid-cols-2 [&>*]:border-border [&>*:nth-child(-n+2)]:border-b md:[&>*:nth-child(-n+2)]:border-b-0 lg:[&>*:nth-child(-n+2)]:border-b"
    >
      <Kennwert
        label="Ruhepuls"
        wert={rhr.wert != null ? Math.round(rhr.wert) : <Leer />}
        einheit={rhr.wert != null ? "bpm" : undefined}
        fuss={<TrendText diff={rhr.diff} />}
      />
      <Kennwert
        label="HRV letzte Nacht"
        wert={hrv.wert != null ? Math.round(hrv.wert) : <Leer />}
        einheit={hrv.wert != null ? "ms" : undefined}
        fuss={hStufe ? <span className={TON[hStufe.ton]}>{hStufe.label}</span> : <TrendText diff={hrv.diff} />}
      />
      <Kennwert
        label="Stress Ø"
        wert={stress.wert != null ? Math.round(stress.wert) : <Leer />}
        fuss={sStufe ? <span className={TON[sStufe.ton]}>{sStufe.label}</span> : "nicht verfügbar"}
      />
      <Kennwert
        label="Form (TSB)"
        wert={tsb != null ? mitVorzeichen(tsb) : <Leer />}
        fuss={form ?? "nicht verfügbar"}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Letzte Aktivitäten                                                  */
/* ------------------------------------------------------------------ */

export function AktivitaetenKompakt({ aktivitaeten, heute }: { aktivitaeten: DashboardAktivitaet[]; heute: string }) {
  return (
    <Abschnitt
      titel="Letzte Aktivitäten"
      aktion={
        <Link href="/activities" className="text-xs text-muted-foreground hover:text-foreground">
          Alle ›
        </Link>
      }
    >
      {aktivitaeten.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Aktivitäten.</p>
      ) : (
        <ul className="-mt-1 divide-y divide-border">
          {aktivitaeten.slice(0, 4).map((a) => {
            const iso = new Date(a.startZeit).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
            const mitDistanz = a.distanzM != null && a.distanzM > 300;
            return (
              <li key={a.id}>
                <Link href={`/activities/${a.id}`} className="flex min-h-13 items-center gap-3 py-2.5 transition-colors hover:text-foreground">
                  <SportIcon typ={a.typ} groesse="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{a.name ?? sportName(a.typ)}</div>
                    <div className="text-xs text-muted-foreground">
                      {relativerTag(iso, heute)} · {sportName(a.typ)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="stat-display text-[15px]">
                      {mitDistanz ? `${((a.distanzM ?? 0) / 1000).toFixed(1)} km` : formatDauer(a.dauerS)}
                    </div>
                    {mitDistanz && <div className="text-xs text-muted-foreground tabular-nums">{formatDauer(a.dauerS)}</div>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ */
/* Woche und Gewicht                                                   */
/* ------------------------------------------------------------------ */

function Zahl({ label, wert, einheit, fuss }: { label: string; wert: React.ReactNode; einheit?: string; fuss?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="stat-display text-[20px] leading-none">{wert}</span>
        {einheit && <span className="text-xs text-muted-foreground">{einheit}</span>}
      </div>
      {fuss && <div className="mt-1 truncate text-xs text-dim-foreground">{fuss}</div>}
    </div>
  );
}

export function WocheKompakt({
  woche,
  vorwoche,
  fortschritt,
}: {
  woche: Wochenwerte;
  vorwoche: Wochenwerte;
  fortschritt: { erledigt: number; geplant: number };
}) {
  return (
    <Abschnitt
      titel="Diese Woche"
      aktion={
        <Link href="/plan" className="text-xs text-muted-foreground hover:text-foreground">
          Plan ›
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
        <Zahl label="Laufdistanz" wert={woche.laufKm.toLocaleString("de-CH", { maximumFractionDigits: 1 })} einheit="km" fuss={`Vorwoche ${vorwoche.laufKm.toLocaleString("de-CH", { maximumFractionDigits: 1 })} km`} />
        <Zahl label="Trainingszeit" wert={formatStundenMinuten(woche.dauerS)} einheit="h" fuss={`Vorwoche ${formatStundenMinuten(vorwoche.dauerS)} h`} />
        <Zahl
          label="Einheiten"
          wert={woche.einheiten}
          fuss={fortschritt.geplant > 0 ? `${fortschritt.erledigt} von ${fortschritt.geplant} geplanten` : "alle Sportarten"}
        />
        <Zahl
          label="Ø Pace"
          wert={woche.laufPaceSKm != null ? formatPaceKurz(woche.laufPaceSKm) : <Leer />}
          einheit={woche.laufPaceSKm != null ? "/km" : undefined}
          fuss={woche.avgHr != null ? `Ø ${woche.avgHr} bpm` : "Puls nicht verfügbar"}
        />
      </div>
    </Abschnitt>
  );
}

export function GewichtKompakt({ g, heute }: { g: GewichtKurz | null; heute: string }) {
  return (
    <Abschnitt
      titel="Gewicht"
      aktion={
        <Link href="/body#gewicht" className="text-xs text-muted-foreground hover:text-foreground">
          Körper ›
        </Link>
      }
    >
      {g ? (
        <div className="flex items-end justify-between gap-4">
          <div className="grid flex-1 grid-cols-3 gap-x-6">
            <Zahl label="Aktuell" wert={g.aktuellKg.toFixed(1)} einheit="kg" fuss={relativerTag(g.datum, heute)} />
            <Zahl label="Trend" wert={g.trendKg != null ? g.trendKg.toFixed(1) : <Leer />} einheit={g.trendKg != null ? "kg" : undefined} fuss="7-Tage-Median" />
            <Zahl
              label="30 Tage"
              wert={g.veraenderung30 != null ? kgDelta(g.veraenderung30).replace(" kg", "") : <Leer />}
              einheit={g.veraenderung30 != null ? "kg" : undefined}
              fuss="Veränderung"
            />
          </div>
          <MiniLinie werte={g.verlauf.map((p) => p.kg)} className="hidden h-9 w-28 sm:block" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Noch keine Wägung — nach dem nächsten Sync verfügbar.</p>
      )}
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ */
/* Gesamtbilanz                                                        */
/* ------------------------------------------------------------------ */

export function Gesamtbilanz({ allTime, seitText }: { allTime: AllTimeStats; seitText: string | null }) {
  const werte: [string, string][] = [
    ["Distanz", `${allTime.distanzKm.toLocaleString("de-CH")} km`],
    ["davon Laufen", `${allTime.laufKm.toLocaleString("de-CH")} km`],
    ["Höhenmeter", `${allTime.hm.toLocaleString("de-CH")} Hm`],
    ["Trainingszeit", `${allTime.stunden.toLocaleString("de-CH")} h`],
    ["Aktivitäten", allTime.aktivitaeten.toLocaleString("de-CH")],
    ["Längster Lauf", `${allTime.laengsterLaufKm.toLocaleString("de-CH")} km`],
  ];
  return (
    <Abschnitt titel="Gesamtbilanz" aktion={seitText ? <span className="text-xs text-muted-foreground">{seitText}</span> : undefined}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {werte.map(([label, wert]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="stat-display mt-0.5 text-[15px]">{wert}</dd>
          </div>
        ))}
      </dl>
    </Abschnitt>
  );
}
