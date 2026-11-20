import { AppLink as Link } from "@/components/basis-pfad";
import { Abschnitt } from "@/components/ui/kachel";
import { Skeleton } from "@/components/ui/skeleton";
import { HypnogrammMini } from "@/components/schlaf/hypnogramm-mini";
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
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-full" />
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
 * Schlaf der letzten Nacht als ruhiger Abschnitt: Dauer und Score, schlanke
 * Phasen-Zeitleiste, Phasen in Minuten, Herzfrequenz, HRV und Atmung.
 * Ohne Daten ein kurzer Hinweis (auch von der Demo genutzt).
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
  const scoreFarbe =
    a.ampel === "gruen" ? "text-status-green" : a.ampel === "gelb" ? "text-status-yellow" : a.ampel === "rot" ? "text-status-red" : "text-muted-foreground";

  return (
    <Abschnitt titel={nichtHeute ? `Schlaf · ${formatDatumLang(detail.datum)}` : "Schlaf"} aktion={<DetailLink datum={detail.datum} />}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="stat-display text-[30px] leading-none">{formatDauer(z.dauerS)}</div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {z.startUhr && z.endeUhr ? `${z.startUhr} – ${z.endeUhr}` : "Zeitraum nicht verfügbar"}
              {z.effizienzProz != null && ` · Effizienz ${Math.round(z.effizienzProz)} %`}
              {dauer7?.abw7Proz != null &&
                ` · ${dauer7.abw7Proz > 0 ? "+" : "−"}${Math.abs(Math.round(dauer7.abw7Proz))} % ggü. 7 Tagen`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Score</div>
            <div className={cn("stat-display text-[22px] leading-none", a.garminScore != null && scoreFarbe)}>
              {a.garminScore != null ? Math.round(a.garminScore) : "–"}
            </div>
          </div>
        </div>

        <HypnogrammMini epochen={detail.epochen} startMs={z.startMs} endeMs={z.endeMs} className="h-9 w-full" />

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
