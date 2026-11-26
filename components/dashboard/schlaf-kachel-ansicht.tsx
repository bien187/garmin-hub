import { AppLink as Link } from "@/components/basis-pfad";
import { Abschnitt } from "@/components/ui/kachel";
import { Skeleton } from "@/components/ui/skeleton";
import { NachtUeberblick } from "@/components/schlaf/nacht-ueberblick";
import { ScoreRing } from "@/components/schlaf/score-ring";
import { formatDauer } from "@/lib/engine/schlaf";
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

        <NachtUeberblick epochen={detail.epochen} analyse={a} />

        {a.fazit && <p className="text-[13px] leading-snug text-muted-foreground">{a.fazit}</p>}
      </div>
    </Abschnitt>
  );
}
