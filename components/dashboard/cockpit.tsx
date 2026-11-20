import {
  ArrowRight,
  Check,
  Clock3,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Moon,
  Route,
  Timer,
  Watch,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/basis-pfad";
import { Card } from "@/components/ui/card";
import { KachelKopf } from "@/components/ui/kachel";
import { Pill } from "@/components/ui/pill";
import { Balken, Ring } from "@/components/ui/fortschritt";
import { Hochzaehlen } from "@/components/ui/hochzaehlen";
import { EinheitIcon, SportIcon } from "@/components/sport-icon";
import { Logo } from "@/components/logo";
import type { DashboardAktivitaet, NaechsteEinheit } from "@/lib/server/dashboard-service";
import type { Wochenwerte, WochenTag } from "@/lib/engine/wochenstatistik";
import type { Trainingsblock } from "@/lib/engine/block";
import { geplanteDauerS, geplanteDistanzM, intensitaet, zielPace, type StrukturLose } from "@/lib/engine/einheit";
import { sportName } from "@/lib/engine/sport";
import {
  formatDatumLang,
  formatDauer,
  formatPaceKurz,
  formatStundenMinuten,
  jetztMs,
  relativerTag,
  stundeZuerich,
  tageszeitGruss,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* A. Begrüssung                                                       */
/* ------------------------------------------------------------------ */

export function Begruessung({
  name,
  heute,
  satz,
  block,
  serie,
  aktion,
}: {
  name: string | null;
  heute: string;
  satz: string;
  block: Trainingsblock;
  /** Trainingswochen in Folge (Konsistenz) */
  serie: number | null;
  aktion?: React.ReactNode;
}) {
  const gruss = tageszeitGruss(stundeZuerich(jetztMs()));
  const datum = new Date(heute + "T12:00:00").toLocaleDateString("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <section className="flaeche-hero gh-auf relative flex h-full flex-col overflow-hidden rounded-xl p-5 ring-1 ring-white/[0.06] shadow-card md:p-7">
      {/* dekorative Puls-Linie im Hintergrund */}
      <svg
        aria-hidden
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-primary/15"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M0 90 H120 L140 60 L165 110 L190 30 L215 95 L235 75 H400" />
      </svg>
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="size-10 md:hidden" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground first-letter:uppercase">{datum}</p>
            <h1 className="truncate text-[26px] leading-tight font-semibold tracking-tight md:text-[32px]">
              {gruss}
              {name ? `, ${name}` : ""}
            </h1>
          </div>
        </div>
        {aktion}
      </div>
      <p className="relative mt-3 max-w-xl text-[15px] leading-snug text-foreground/85">{satz}</p>
      <div className="relative mt-auto flex flex-wrap gap-2 pt-4">
        <Pill ton={block.entlastung ? "neutral" : "lime"} icon={Gauge}>
          {block.name} · {block.fokus}
        </Pill>
        {serie != null && serie > 0 && (
          <Pill ton="coral" icon={Flame}>
            {serie === 1 ? "1 Woche" : `${serie} Wochen`} in Folge
          </Pill>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* B. Kennzahlen der Woche                                             */
/* ------------------------------------------------------------------ */

function Vergleich({ jetzt, vorher, einheit }: { jetzt: number; vorher: number; einheit: string }) {
  if (!(vorher > 0)) return <span className="text-dim-foreground">Vorwoche: –</span>;
  return (
    <span className="text-dim-foreground">
      Vorwoche {vorher.toLocaleString("de-CH", { maximumFractionDigits: 1 })} {einheit}
      {jetzt >= vorher && <span className="ml-1 font-medium text-primary">↑</span>}
    </span>
  );
}

function StatKarte({
  icon: Icon,
  label,
  ton,
  children,
  fuss,
  verzoegerung = 0,
}: {
  icon: typeof Footprints;
  label: string;
  ton: "lime" | "coral" | "neutral";
  children: React.ReactNode;
  fuss?: React.ReactNode;
  verzoegerung?: number;
}) {
  return (
    <Card size="sm" className="gh-auf karte-hover gap-2.5" style={{ animationDelay: `${verzoegerung}ms` }}>
      <div className="flex items-center justify-between px-(--card-spacing)">
        <span className="kachel-titel">{label}</span>
        <Icon
          className={cn(
            "size-4",
            ton === "lime" ? "text-primary" : ton === "coral" ? "text-coral" : "text-muted-foreground"
          )}
        />
      </div>
      <div className="px-(--card-spacing)">{children}</div>
      {fuss && <div className="px-(--card-spacing) text-[11px] leading-tight">{fuss}</div>}
    </Card>
  );
}

const Zahl = ({ children, einheit }: { children: React.ReactNode; einheit?: string }) => (
  <div className="flex items-baseline gap-1">
    <span className="stat-display text-[30px] leading-none md:text-[34px]">{children}</span>
    {einheit && <span className="text-sm font-medium text-muted-foreground">{einheit}</span>}
  </div>
);

export function Kennzahlen({
  woche,
  vorwoche,
  fortschritt,
}: {
  woche: Wochenwerte;
  vorwoche: Wochenwerte;
  fortschritt: { erledigt: number; geplant: number };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatKarte
        icon={Route}
        label="Laufdistanz"
        ton="coral"
        fuss={<Vergleich jetzt={woche.laufKm} vorher={vorwoche.laufKm} einheit="km" />}
      >
        <Zahl einheit="km">
          <Hochzaehlen wert={woche.laufKm} dezimalen={1} />
        </Zahl>
      </StatKarte>
      <StatKarte
        icon={Check}
        label="Einheiten"
        ton="lime"
        verzoegerung={40}
        fuss={
          fortschritt.geplant > 0 ? (
            <span className="text-dim-foreground">
              {fortschritt.erledigt} von {fortschritt.geplant} geplanten erledigt
            </span>
          ) : (
            <span className="text-dim-foreground">diese Woche, alle Sportarten</span>
          )
        }
      >
        <div className="flex items-center justify-between gap-2">
          <Zahl>
            <Hochzaehlen wert={woche.einheiten} />
          </Zahl>
          {fortschritt.geplant > 0 && (
            <Ring
              wert={fortschritt.erledigt}
              max={fortschritt.geplant}
              groesse={38}
              dicke={4.5}
              label={`${fortschritt.erledigt} von ${fortschritt.geplant} geplanten Einheiten erledigt`}
            />
          )}
        </div>
      </StatKarte>
      <StatKarte
        icon={Clock3}
        label="Trainingszeit"
        ton="neutral"
        verzoegerung={80}
        fuss={
          vorwoche.dauerS > 0 ? (
            <span className="text-dim-foreground">Vorwoche {formatStundenMinuten(vorwoche.dauerS)} h</span>
          ) : (
            <span className="text-dim-foreground">Vorwoche: –</span>
          )
        }
      >
        <Zahl einheit="h">{formatStundenMinuten(woche.dauerS)}</Zahl>
      </StatKarte>
      <StatKarte
        icon={HeartPulse}
        label="Ø Pace · Puls"
        ton="coral"
        verzoegerung={120}
        fuss={
          <span className="text-dim-foreground">
            {woche.avgHr != null ? `Ø ${woche.avgHr} bpm über alle Einheiten` : "Puls nicht verfügbar"}
          </span>
        }
      >
        {woche.laufPaceSKm != null ? (
          <Zahl einheit="/km">{formatPaceKurz(woche.laufPaceSKm)}</Zahl>
        ) : (
          <div className="flex h-[34px] items-end text-sm text-muted-foreground">Noch kein Lauf</div>
        )}
      </StatKarte>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C. Wochenübersicht                                                  */
/* ------------------------------------------------------------------ */

const KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function TagesPunkt({ tag, heute }: { tag: WochenTag; heute: string }) {
  const istHeute = tag.datum === heute;
  const vergangen = tag.datum < heute;
  const geplant = tag.geplant[0];
  const erledigt = tag.geplant.length > 0 && tag.geplant.every((g) => g.status === "absolviert");
  const verpasst = tag.geplant.some((g) => g.status === "verpasst");
  const extra = tag.geplant.length === 0 && tag.aktivitaeten.length > 0;

  let inhalt: React.ReactNode;
  let klasse = "bg-surface text-dim-foreground";
  if (erledigt) {
    klasse = "flaeche-lime";
    inhalt = <Check className="size-4" strokeWidth={3} />;
  } else if (verpasst) {
    klasse = "bg-status-red/12 text-status-red ring-1 ring-status-red/40";
    inhalt = <X className="size-4" strokeWidth={2.6} />;
  } else if (extra) {
    klasse = "bg-coral/18 text-coral";
    inhalt = <Footprints className="size-4" />;
  } else if (geplant) {
    klasse = "bg-surface text-foreground ring-1 ring-inset ring-white/12";
    inhalt = <EinheitIcon typ={geplant.typ} groesse="sm" className="size-full bg-transparent" />;
  } else if (tag.ruhetag) {
    inhalt = <Moon className="size-3.5" />;
  } else {
    inhalt = <span className="text-[13px] leading-none">·</span>;
  }

  const beschreibung = erledigt
    ? "erledigt"
    : verpasst
      ? "verpasst"
      : extra
        ? "freiwilliges Training"
        : geplant
          ? geplant.titel
          : tag.ruhetag
            ? "Ruhetag"
            : "frei";

  return (
    <li className="flex flex-col items-center gap-1.5" aria-label={`${formatDatumLang(tag.datum)}: ${beschreibung}`}>
      <span
        className={cn(
          "text-[11px] font-medium",
          istHeute ? "text-primary" : vergangen ? "text-dim-foreground" : "text-muted-foreground"
        )}
      >
        {KURZ[(new Date(tag.datum + "T12:00:00").getDay() + 6) % 7]}
      </span>
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full transition-transform",
          klasse,
          istHeute && "ring-2 ring-primary ring-offset-2 ring-offset-card"
        )}
      >
        {inhalt}
      </span>
    </li>
  );
}

export function WochenUebersicht({
  tage,
  heute,
  fortschritt,
}: {
  tage: WochenTag[];
  heute: string;
  fortschritt: { erledigt: number; geplant: number };
}) {
  return (
    <Card className="gh-auf h-full">
      <KachelKopf
        icon={Gauge}
        ton="lime"
        titel="Diese Woche"
        aktion={
          <Link href="/plan" className="flex min-h-11 items-center gap-1 text-xs font-medium text-primary">
            Plan <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="space-y-4 px-(--card-spacing)">
        {tage.length > 0 ? (
          <ol className="grid grid-cols-7 gap-1">
            {tage.map((t) => (
              <TagesPunkt key={t.datum} tag={t} heute={heute} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Noch kein Plan für diese Woche.</p>
        )}
        {fortschritt.geplant > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Trainingsfortschritt</span>
              <span className="stat-display text-sm">
                {fortschritt.erledigt}/{fortschritt.geplant}
              </span>
            </div>
            <Balken wert={fortschritt.erledigt} max={fortschritt.geplant} />
          </div>
        ) : (
          <Link href="/plan" className="block text-xs font-medium text-primary">
            Woche im Plan generieren →
          </Link>
        )}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-dim-foreground">
          <span className="flex items-center gap-1">
            <span className="flaeche-lime size-2 rounded-full" /> erledigt
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-coral" /> freiwillig
          </span>
          <span className="flex items-center gap-1">
            <Moon className="size-2.5" /> Ruhe
          </span>
        </p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* E. Nächstes Training                                                */
/* ------------------------------------------------------------------ */

export function NaechstesTraining({
  einheit,
  heute,
  paceFallback,
}: {
  einheit: NaechsteEinheit | null;
  heute: string;
  /** Pace für Distanz-Schritte ohne Pace-Ziel (s/km) */
  paceFallback?: number;
}) {
  if (!einheit) {
    return (
      <Card className="gh-auf h-full justify-between">
        <KachelKopf icon={Timer} ton="lime" titel="Nächstes Training" />
        <div className="space-y-3 px-(--card-spacing)">
          <p className="text-sm text-muted-foreground">
            Für die kommenden Tage ist noch nichts geplant. Der Plan erstellt deine Woche mit Gym, Intervallen und
            lockerem Lauf.
          </p>
          <Link
            href="/plan"
            className="flaeche-lime inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            Zum Plan <ArrowRight className="size-4" />
          </Link>
        </div>
      </Card>
    );
  }
  const struktur = einheit.struktur as StrukturLose | null;
  const dauerS = geplanteDauerS(struktur, paceFallback);
  const distanz = geplanteDistanzM(struktur);
  const pace = zielPace(struktur);
  const intens = intensitaet(einheit.typ);
  const uebungen = struktur?.uebungen?.length ?? 0;

  return (
    <Card className="gh-auf relative h-full justify-between shadow-glow ring-primary/30">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/10 blur-3xl"
      />
      <KachelKopf
        icon={Timer}
        ton="lime"
        titel="Nächstes Training"
        aktion={
          einheit.status === "gepusht" ? (
            <Pill ton="lime" icon={Watch}>
              Auf der Uhr
            </Pill>
          ) : undefined
        }
      />
      <div className="relative space-y-3 px-(--card-spacing)">
        <div className="flex items-start gap-3">
          <EinheitIcon typ={einheit.typ} groesse="lg" />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {relativerTag(einheit.datum, heute)}
            </p>
            <h3 className="text-xl leading-tight font-semibold tracking-tight">{einheit.titel}</h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {dauerS != null && (
            <Pill icon={Clock3}>~{Math.round(dauerS / 60)} Min</Pill>
          )}
          {intens && (
            <Pill ton={intens.stufe >= 3 ? "coral" : intens.stufe === 1 ? "lime" : "neutral"} icon={Flame}>
              {intens.label}
            </Pill>
          )}
          {distanz != null && <Pill icon={Route}>{(distanz / 1000).toLocaleString("de-CH")} km Kern</Pill>}
          {pace && (
            <Pill icon={Gauge}>
              {formatPaceKurz(pace.von)}–{formatPaceKurz(pace.bis)} /km
            </Pill>
          )}
          {uebungen > 0 && <Pill icon={Check}>{uebungen} Übungen</Pill>}
        </div>
        {einheit.beschreibung && (
          <p className="line-clamp-3 text-[13px] leading-snug text-muted-foreground">{einheit.beschreibung}</p>
        )}
      </div>
      <div className="relative px-(--card-spacing)">
        <Link
          href="/plan"
          className="flaeche-lime inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          Zum Wochenplan <ArrowRight className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* F. Letzte Aktivitäten                                               */
/* ------------------------------------------------------------------ */

export function LetzteAktivitaeten({
  aktivitaeten,
  heute,
}: {
  aktivitaeten: DashboardAktivitaet[];
  heute: string;
}) {
  return (
    <Card className="gh-auf h-full">
      <KachelKopf
        icon={Footprints}
        ton="coral"
        titel="Letzte Aktivitäten"
        aktion={
          <Link href="/activities" className="flex min-h-11 items-center gap-1 text-xs font-medium text-primary">
            Alle <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {aktivitaeten.length === 0 ? (
        <p className="px-(--card-spacing) text-sm text-muted-foreground">Noch keine Aktivitäten.</p>
      ) : (
        <ul className="-my-1 px-[calc(var(--card-spacing)-8px)]">
          {aktivitaeten.map((a) => {
            const datum = new Date(a.startZeit);
            const iso = datum.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
            const lauf = a.distanzM != null && a.distanzM > 300;
            return (
              <li key={a.id}>
                <Link
                  href={`/activities/${a.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface"
                >
                  <SportIcon typ={a.typ} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name ?? sportName(a.typ)}</div>
                    <div className="stat-mono truncate text-[11px] text-muted-foreground">
                      {relativerTag(iso, heute)} · {formatDauer(a.dauerS)}
                      {a.avgPace != null && lauf ? ` · ${formatPaceKurz(a.avgPace)}/km` : ""}
                      {a.avgHr != null ? ` · ${Math.round(a.avgHr)} bpm` : ""}
                    </div>
                  </div>
                  {lauf ? (
                    <span className="stat-display shrink-0 text-lg">
                      {((a.distanzM ?? 0) / 1000).toFixed(1)}
                      <span className="ml-0.5 text-[11px] font-normal text-dim-foreground">km</span>
                    </span>
                  ) : (
                    <span className="stat-display shrink-0 text-lg">{formatDauer(a.dauerS)}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
