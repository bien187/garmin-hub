import { AppLink as Link } from "@/components/basis-pfad";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HypnogrammMini } from "@/components/schlaf/hypnogramm-mini";
import { PhasenBalken } from "@/components/schlaf/phasen-balken";
import { TrendBalken } from "@/components/schlaf/trend-balken";
import { formatDauer } from "@/lib/engine/schlaf";
import { formatDatumLang } from "@/lib/format";
import type { SchlafDetail } from "@/lib/server/sleep-service";

const TITEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function Rahmen({ children, titel = "Schlaf letzte Nacht" }: { children: React.ReactNode; titel?: string }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className={TITEL}>{titel}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SchlafKachelSkeleton() {
  return (
    <Rahmen>
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </Rahmen>
  );
}

/** Darstellung der Kachel aus fertigen Daten (auch von der Demo genutzt) */
export function SchlafKachelAnsicht({ detail, heute }: { detail: SchlafDetail | null; heute: string }) {
  if (!detail) {
    return (
      <Rahmen>
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Moon className="mt-0.5 size-4 shrink-0" />
          <p>Noch keine Schlafdaten. Nach dem nächsten Sync verfügbar.</p>
        </div>
      </Rahmen>
    );
  }
  const a = detail.analyse;
  const z = a.zusammenfassung;
  const dauer7 = a.vergleich.find((v) => v.metrik === "dauerS");
  const nichtHeute = detail.datum !== heute;
  const Pfeil = dauer7?.richtung7 === "hoch" ? ArrowUpRight : dauer7?.richtung7 === "runter" ? ArrowDownRight : Minus;
  const pfeilFarbe =
    dauer7?.bewertung7 === "gut" ? "text-status-green" : dauer7?.bewertung7 === "schlecht" ? "text-status-orange" : "text-muted-foreground";
  const ampel = a.ampel === "gruen" ? "bg-status-green" : a.ampel === "gelb" ? "bg-status-yellow" : a.ampel === "rot" ? "bg-status-red" : "bg-muted";

  return (
    <Link
      href={`/schlaf/${detail.datum}`}
      className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`Schlaf-Details für die Nacht auf ${formatDatumLang(detail.datum)}`}
    >
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className={TITEL}>
              Schlaf letzte Nacht
              {nichtHeute && <span className="ml-1 normal-case tracking-normal text-dim-foreground">· {formatDatumLang(detail.datum)}</span>}
            </CardTitle>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="stat-display text-3xl leading-none">{formatDauer(z.dauerS)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {z.startUhr && z.endeUhr ? `${z.startUhr}–${z.endeUhr}` : "Zeitraum nicht verfügbar"}
                {z.effizienzProz != null && ` · Effizienz ${Math.round(z.effizienzProz)} %`}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className={`size-2 rounded-full ${ampel}`} aria-hidden />
                <span className="stat-display text-2xl leading-none">{a.garminScore != null ? Math.round(a.garminScore) : "–"}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Garmin-Score</div>
            </div>
          </div>

          <HypnogrammMini epochen={detail.epochen} startMs={z.startMs} endeMs={z.endeMs} className="h-10 w-full" />
          <PhasenBalken phasen={a.phasen} />

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={`flex items-center gap-1 ${pfeilFarbe}`}>
              <Pfeil className="size-3.5" />
              {dauer7?.abw7Proz != null
                ? `${dauer7.abw7Proz > 0 ? "+" : ""}${Math.round(dauer7.abw7Proz)} % vs. 7-Tage-Mittel (${formatDauer(dauer7.mittel7)})`
                : "Noch kein 7-Tage-Mittel"}
            </span>
            <TrendBalken trend={detail.trend} className="h-6 w-20 shrink-0" />
          </div>
          <p className="text-[13px] leading-snug">{a.fazit}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
