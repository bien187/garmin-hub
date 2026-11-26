import { AppLink as Link } from "@/components/basis-pfad";
import { Abschnitt } from "@/components/ui/kachel";
import { Skeleton } from "@/components/ui/skeleton";
import { HypnogrammMini } from "@/components/schlaf/hypnogramm-mini";
import { PhasenBalken } from "@/components/schlaf/phasen-balken";
import { ScoreRing } from "@/components/schlaf/score-ring";
import { PHASEN_FARBE } from "@/components/schlaf/farben";
import { formatDauer, PHASEN, PHASEN_LABEL } from "@/lib/engine/schlaf";
import { formatDatumLang } from "@/lib/format";
import type { SchlafDetail } from "@/lib/server/sleep-service";
import { cn } from "@/lib/utils";

const DetailLink = ({ datum }: { datum: string }) => (
  <Link href={`/schlaf/${datum}`} className="text-xs text-muted-foreground hover:text-foreground">
    Details ›
  </Link>
);

export function SchlafKachelSkeleton() {
  return (
    <Abschnitt titel="Schlaf">
      <div className="space-y-4" aria-busy>
        <div className="flex items-center gap-5">
          <Skeleton className="size-[96px] shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </Abschnitt>
  );
}

/** Ein Wert in der Kopfzeile des Schlafabschnitts */
function Wert({ label, wert, einheit }: { label: string; wert: string | null; einheit?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="stat-display text-[15px] whitespace-nowrap">
        {wert ?? <span className="text-dim-foreground">–</span>}
        {wert && einheit && <span className="ml-0.5 text-xs text-muted-foreground">{einheit}</span>}
      </div>
    </div>
  );
}

/**
 * Schlaf der letzten Nacht: Score-Ring mit Garmin-Bewertung, daneben Dauer,
 * Bettzeit und Vergleich mit den letzten 7 Nächten; darunter der Verlauf
 * der Nacht (Phasen-Zeitleiste und Anteile), Phasen in Minuten,
 * Herzfrequenz, HRV und Atmung. Ohne Daten ein kurzer Hinweis (auch von der
 * Demo genutzt).
 */
export function SchlafKachelAnsicht({ detail, heute }: { detail: SchlafDetail | null; heute: string }) {
  if (!detail) {
    return (
      <Abschnitt titel="Schlaf">
        <p className="text-sm text-muted-foreground">Noch keine Schlafdaten — nach dem nächsten Sync verfügbar.</p>
      </Abschnitt>
    );
  }
  const a = detail.analyse;
  const z = a.zusammenfassung;
  const nichtHeute = detail.datum !== heute;
  const dauer7 = a.vergleich.find((v) => v.metrik === "dauerS");
  const abw7 = dauer7?.abw7Proz != null ? Math.round(dauer7.abw7Proz) : null;

  return (
    <Abschnitt titel={nichtHeute ? `Schlaf · ${formatDatumLang(detail.datum)}` : "Schlaf"} aktion={<DetailLink datum={detail.datum} />}>
      <div className="space-y-4">
        {/* Score-Ring, daneben Dauer und Bettzeit */}
        <div className="flex items-center gap-5">
          <ScoreRing score={a.garminScore} />
          <div className="min-w-0">
            <div className="stat-display text-[30px] leading-none">{formatDauer(z.dauerS)}</div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {z.startUhr && z.endeUhr ? `${z.startUhr} – ${z.endeUhr}` : "Zeitraum nicht verfügbar"}
              {z.effizienzProz != null && ` · Effizienz ${Math.round(z.effizienzProz)} %`}
            </div>
            <div className={cn("mt-1 text-xs", abw7 != null && abw7 <= -10 ? "text-status-orange" : "text-dim-foreground")}>
              {abw7 != null
                ? `${abw7 > 0 ? "+" : abw7 < 0 ? "−" : "±"}${Math.abs(abw7)} % vs. Ø 7 Nächte${dauer7?.mittel7 != null ? ` (${formatDauer(dauer7.mittel7)})` : ""}`
                : "kein 7-Nächte-Vergleich"}
            </div>
          </div>
        </div>

        {/* Verlauf der Nacht: Phasen-Zeitleiste und Anteile */}
        <div className="space-y-2">
          <HypnogrammMini epochen={detail.epochen} startMs={z.startMs} endeMs={z.endeMs} className="h-12 w-full" />
          <PhasenBalken phasen={a.phasen} legende={false} />
        </div>

        <dl className="grid grid-cols-4 gap-2">
          {PHASEN.map((p) => (
            <div key={p} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: PHASEN_FARBE[p] }} />
                {PHASEN_LABEL[p]}
              </dt>
              <dd className="stat-display mt-0.5 text-[15px] whitespace-nowrap">
                {a.phasen[p].minuten != null ? (
                  <>
                    {a.phasen[p].minuten}
                    <span className="ml-0.5 text-xs text-muted-foreground">min</span>
                  </>
                ) : (
                  <span className="text-dim-foreground">–</span>
                )}
              </dd>
              <dd className="text-xs text-dim-foreground tabular-nums">
                {a.phasen[p].prozent != null ? `${Math.round(a.phasen[p].prozent!)} %` : "–"}
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Wert label="Schlaf-HF Ø" wert={a.hr ? String(Math.round(a.hr.mittel)) : null} einheit="bpm" />
          <Wert label="HRV Nacht" wert={a.hrv ? String(Math.round(a.hrv.mittel)) : null} einheit="ms" />
          <Wert label="Atmung Ø" wert={a.atem ? a.atem.mittel.toFixed(1) : null} einheit="/min" />
        </div>

        {a.fazit && <p className="text-[13px] leading-snug text-muted-foreground">{a.fazit}</p>}
      </div>
    </Abschnitt>
  );
}
