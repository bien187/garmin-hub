"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ChevronDown, ClipboardList, Info, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { KachelKopf } from "@/components/ui/kachel";
import { useIstDemo } from "@/components/basis-pfad";
import {
  KLASSEN,
  KRITERIEN,
  kennzahlen as berechneKennzahlen,
  type BewerteteMessung,
  type Klasse,
  type KompositionsFeld,
  type KompositionsReihe,
  type TrendPunkt,
} from "@/lib/engine/gewicht";
import type { GewichtDaten } from "@/lib/server/gewicht-service";
import { addTage, formatDatum, heuteIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KLASSEN_FARBE, QualitaetsBadge } from "./gewicht-qualitaet";
import { Messprotokoll } from "./messprotokoll";

type Zeitraum = "7t" | "30t" | "90t" | "6m" | "1j" | "alles";

const ZEITRAEUME: { id: Zeitraum; label: string; tage: number | null }[] = [
  { id: "7t", label: "7 T", tage: 7 },
  { id: "30t", label: "30 T", tage: 30 },
  { id: "90t", label: "90 T", tage: 90 },
  { id: "6m", label: "6 M", tage: 182 },
  { id: "1j", label: "1 J", tage: 365 },
  { id: "alles", label: "Alles", tage: null },
];

const KOMPOSITION: Record<KompositionsFeld, { label: string; einheit: string; dezimalen: number }> = {
  koerperfettProz: { label: "Körperfett", einheit: "%", dezimalen: 1 },
  muskelmasseKg: { label: "Muskelmasse", einheit: "kg", dezimalen: 1 },
  koerperwasserProz: { label: "Körperwasser", einheit: "%", dezimalen: 1 },
  bmi: { label: "BMI", einheit: "", dezimalen: 1 },
};

const TOOLTIP_STIL: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  fontSize: 12,
  boxShadow: "0 16px 40px -16px rgb(0 0 0 / 70%)",
  padding: "10px 12px",
};

const kg1 = (v: number) => v.toLocaleString("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const delta = (v: number | null | undefined) =>
  v == null ? "–" : Math.abs(v) < 0.05 ? "±0.0" : `${v > 0 ? "+" : "−"}${kg1(Math.abs(v))}`;
const uhr = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const tagLang = (iso: string) =>
  new Date(iso).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zurich" });
/** Mittag des Kalendertags als Zeitachsen-Position für Trendpunkte */
const mittagMs = (datum: string) => Date.parse(datum + "T11:00:00Z");

function bedingungKurz(m: BewerteteMessung): string {
  const b = m.bedingungen;
  const teile: string[] = [];
  if (b.nuechtern != null) teile.push(b.nuechtern ? "nüchtern" : "nicht nüchtern");
  if (b.vorFruehstueck != null) teile.push(b.vorFruehstueck ? "vor dem Frühstück" : "nach dem Frühstück");
  if (b.nachToilette === true) teile.push("nach Toilette");
  return teile.length ? teile.join(", ") : "keine Angaben";
}

function Kennzahl({ label, wert, einheit, fuss, ton }: { label: string; wert: string; einheit?: string; fuss?: React.ReactNode; ton?: "lime" | "coral" }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("stat-display text-2xl leading-none", ton === "lime" && "text-primary", ton === "coral" && "text-coral")}>{wert}</span>
        {einheit && <span className="text-xs text-muted-foreground">{einheit}</span>}
      </div>
      {fuss && <div className="mt-1 truncate text-[11px] text-dim-foreground">{fuss}</div>}
    </div>
  );
}

function Schalter({ aktiv, onClick, children, farbe }: { aktiv: boolean; onClick: () => void; children: React.ReactNode; farbe: string }) {
  return (
    <button
      type="button"
      aria-pressed={aktiv}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-[12px] font-medium transition-colors",
        aktiv ? "bg-surface-2 text-foreground" : "bg-transparent text-dim-foreground ring-1 ring-white/10"
      )}
    >
      <span className="size-2.5 rounded-full" style={{ background: aktiv ? farbe : "transparent", boxShadow: `inset 0 0 0 1.5px ${farbe}` }} />
      {children}
    </button>
  );
}

interface RohPunkt {
  t: number;
  kg: number;
  m: BewerteteMessung;
}

function GewichtTooltip({ active, payload }: { active?: boolean; payload?: { payload?: unknown }[] }) {
  if (!active || !payload?.length) return null;
  const roh = payload.map((p) => p.payload as Partial<RohPunkt & { trend: TrendPunkt; trend30: boolean }>).find((p) => p?.m);
  const trend = payload.map((p) => p.payload as { trend?: TrendPunkt; trend30?: boolean }).find((p) => p?.trend);
  return (
    <div style={TOOLTIP_STIL} className="max-w-64 space-y-1.5">
      {roh?.m && (
        <>
          <div className="text-[11px] text-muted-foreground">
            {tagLang(roh.m.zeitpunkt)} · {uhr(roh.m.zeitpunkt)}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="stat-display text-lg">{kg1(roh.m.gewichtKg)} kg</span>
            <QualitaetsBadge klasse={roh.m.qualitaet.klasse} score={roh.m.qualitaet.score} kurz />
          </div>
          <div className="text-[11px] text-muted-foreground">{bedingungKurz(roh.m)}</div>
          {!roh.m.qualitaet.trendTauglich && <div className="text-[11px] text-status-orange">nicht im Trend (wenig vergleichbar)</div>}
        </>
      )}
      {!roh?.m && trend?.trend && (
        <>
          <div className="text-[11px] text-muted-foreground">{tagLang(trend.trend.datum + "T11:00:00Z")}</div>
          <div className="stat-display text-lg">{kg1(trend.trend.kg)} kg</div>
          <div className="text-[11px] text-muted-foreground">
            {trend.trend30 ? "30-Tage-Median" : "Trend: 7-Tage-Median"} aus {trend.trend.n} Tageswerten
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Smart Weight Tracking (Körper-Seite, Anker #gewicht). Zwei Ebenen:
 * Rohmessungen (unverändert, Punkte nach Messqualität gefärbt) und der
 * standardisierte Trend (7-Tage-Median der vergleichbarsten Tageswerte).
 */
export function GewichtBereich() {
  const demo = useIstDemo();
  const [daten, setDaten] = useState<GewichtDaten | null>(null);
  const [fehler, setFehler] = useState(false);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("90t");
  const [zeigeRoh, setZeigeRoh] = useState(true);
  const [zeigeTrend, setZeigeTrend] = useState(true);
  const [zeige30, setZeige30] = useState(false);
  const [protokoll, setProtokoll] = useState<BewerteteMessung | null>(null);
  const [protokollOffen, setProtokollOffen] = useState(false);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [erklaerung, setErklaerung] = useState(false);

  const lade = useCallback(async () => {
    try {
      const res = await fetch("/api/gewicht");
      if (!res.ok) throw new Error();
      setDaten(await res.json());
      setFehler(false);
    } catch {
      setFehler(true);
    }
  }, []);

  useEffect(() => {
    lade();
  }, [lade]);

  const heute = heuteIso();
  const tage = ZEITRAEUME.find((z) => z.id === zeitraum)!.tage;
  const von = tage != null ? addTage(heute, -(tage - 1)) : null;

  const sicht = useMemo(() => {
    if (!daten) return null;
    const messungen = daten.messungen.filter((m) => von == null || m.datum >= von);
    const roh: RohPunkt[] = messungen.map((m) => ({ t: Date.parse(m.zeitpunkt), kg: m.gewichtKg, m }));
    const trendDaten = (reihe: TrendPunkt[], dreissig = false) => {
      const punkte = reihe.filter((p) => von == null || p.datum >= von);
      // Lücken > 7 Tage unterbrechen die Linie (nichts wird überbrückt)
      const out: { t: number; trendKg: number | null; trend?: TrendPunkt; trend30?: boolean }[] = [];
      punkte.forEach((p, i) => {
        if (i > 0 && (Date.parse(p.datum) - Date.parse(punkte[i - 1].datum)) / 86_400_000 > 7) {
          out.push({ t: mittagMs(p.datum) - 3_600_000, trendKg: null });
        }
        out.push({ t: mittagMs(p.datum), trendKg: p.kg, trend: p, trend30: dreissig });
      });
      return out;
    };
    const alleKg = [...roh.map((r) => r.kg), ...daten.trend7.filter((p) => von == null || p.datum >= von).map((p) => p.kg)];
    const min = alleKg.length ? Math.min(...alleKg) : 0;
    const max = alleKg.length ? Math.max(...alleKg) : 1;
    const startMs = von != null ? Date.parse(von + "T00:00:00Z") : roh[0]?.t ?? Date.now();
    const domainY: [number, number] = [Math.floor((min - 0.6) * 2) / 2, Math.ceil((max + 0.6) * 2) / 2];
    // Gleichmässige Achsenschritte: 0.5 kg, bei grosser Spanne 1 kg
    const schritt = domainY[1] - domainY[0] > 4 ? 1 : 0.5;
    const ticksY: number[] = [];
    for (let v = Math.ceil(domainY[0] / schritt) * schritt; v <= domainY[1] + 1e-9; v += schritt) ticksY.push(Math.round(v * 10) / 10);
    return {
      messungen,
      roh,
      trend7: trendDaten(daten.trend7),
      trend30: trendDaten(daten.trend30, true),
      domainY,
      ticksY,
      domainX: [startMs, Date.parse(heute + "T23:00:00Z")] as [number, number],
      kz: berechneKennzahlen(daten.messungen, daten.trend7, von, heute),
    };
  }, [daten, von, heute]);

  const nachKlasse = useMemo(() => {
    const gruppen: Record<Klasse, RohPunkt[]> = { sehr_gut: [], gut: [], eingeschraenkt: [], gering: [] };
    for (const r of sicht?.roh ?? []) gruppen[r.m.qualitaet.klasse].push(r);
    return gruppen;
  }, [sicht]);

  const liste = useMemo(() => {
    const neueste = [...(sicht?.messungen ?? [])].reverse();
    return alleZeigen ? neueste : neueste.slice(0, 8);
  }, [sicht, alleZeigen]);

  return (
    <section id="gewicht" className="scroll-mt-4 space-y-4">
      <Card className="gh-auf">
        <KachelKopf
          icon={Scale}
          ton="lime"
          titel="Smart Weight Tracking"
          untertitel="Garmin Index S2 · standardisierter Trend"
        />

        {!daten && !fehler && (
          <div className="space-y-3 px-(--card-spacing)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-surface" />
          </div>
        )}

        {fehler && (
          <p className="px-(--card-spacing) text-sm text-muted-foreground">Gewichtsdaten konnten nicht geladen werden.</p>
        )}

        {daten && !daten.verfuegbar && (
          <div className="mx-(--card-spacing) flex gap-2.5 rounded-xl bg-surface p-3 text-[13px] text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Gewichtstracking ist noch nicht eingerichtet: Die Datenbank-Migration <code>drizzle/0003_gewicht.sql</code>{" "}
              anwenden, danach synchronisieren.
            </p>
          </div>
        )}

        {daten?.verfuegbar && daten.messungen.length === 0 && (
          <p className="px-(--card-spacing) text-sm text-muted-foreground">
            Noch keine Wägung. Stell dich auf die Waage — nach dem nächsten Sync erscheinen die Messungen hier.
          </p>
        )}

        {sicht && daten && daten.messungen.length > 0 && (
          <div className="space-y-4 px-(--card-spacing)">
            {/* Kennzahlen */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kennzahl
                label="Aktuell"
                wert={sicht.kz.aktuell ? kg1(sicht.kz.aktuell.kg) : "–"}
                einheit="kg"
                fuss={sicht.kz.aktuell ? `${formatDatum(sicht.kz.aktuell.datum)}, ${uhr(sicht.kz.aktuell.zeitpunkt)}` : undefined}
              />
              <Kennzahl
                label="Trend"
                wert={sicht.kz.trend ? kg1(sicht.kz.trend.kg) : "–"}
                einheit="kg"
                ton="lime"
                fuss={sicht.kz.trend ? "7-Tage-Median" : "zu wenige vergleichbare Tage"}
              />
              <Kennzahl label="7 Tage" wert={delta(sicht.kz.veraenderung7?.kg)} einheit="kg" fuss="Veränderung des Trends" />
              <Kennzahl label="30 Tage" wert={delta(sicht.kz.veraenderung30?.kg)} einheit="kg" fuss="Veränderung des Trends" />
            </div>

            {/* Filter und Ebenen */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Zeitraum" className="flex flex-wrap rounded-full bg-surface p-1">
                {ZEITRAEUME.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    aria-pressed={zeitraum === z.id}
                    onClick={() => setZeitraum(z.id)}
                    className={cn(
                      "min-h-9 rounded-full px-3 text-[12px] font-medium transition-colors",
                      zeitraum === z.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Schalter aktiv={zeigeRoh} onClick={() => setZeigeRoh((v) => !v)} farbe="#9aa7ba">
                  Messungen
                </Schalter>
                <Schalter aktiv={zeigeTrend} onClick={() => setZeigeTrend((v) => !v)} farbe="#b8f36b">
                  Trend
                </Schalter>
                <Schalter aktiv={zeige30} onClick={() => setZeige30((v) => !v)} farbe="#ff9466">
                  30 Tage
                </Schalter>
              </div>
            </div>

            {/* Diagramm */}
            <div className="h-72 w-full md:h-80">
              {sicht.roh.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Keine Messung in diesem Zeitraum.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 8, right: 6, bottom: 0, left: -8 }}>
                    <defs>
                      <filter id="trend-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      type="number"
                      dataKey="t"
                      domain={sicht.domainX}
                      scale="time"
                      tickFormatter={(t: number) => formatDatum(new Date(t).toISOString().slice(0, 10))}
                      tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      type="number"
                      dataKey="kg"
                      domain={sicht.domainY}
                      ticks={sicht.ticksY}
                      interval={0}
                      tickFormatter={(v: number) => kg1(v)}
                      tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip content={<GewichtTooltip />} cursor={{ stroke: "rgb(255 255 255 / 15%)" }} />
                    {zeigeRoh &&
                      (Object.keys(nachKlasse) as Klasse[]).map((k) => (
                        <Scatter
                          key={k}
                          name={KLASSEN[k].label}
                          data={nachKlasse[k]}
                          dataKey="kg"
                          fill={KLASSEN_FARBE[k]}
                          fillOpacity={k === "gering" ? 0.55 : 0.9}
                          shape="circle"
                          isAnimationActive={false}
                        />
                      ))}
                    {zeige30 && (
                      <Line
                        data={sicht.trend30}
                        dataKey="trendKg"
                        type="monotone"
                        stroke="var(--coral)"
                        strokeWidth={2}
                        strokeDasharray="6 5"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    {zeigeTrend && (
                      <Line
                        data={sicht.trend7}
                        dataKey="trendKg"
                        type="monotone"
                        stroke="var(--primary)"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5, fill: "var(--primary)", strokeWidth: 0 }}
                        connectNulls={false}
                        filter="url(#trend-glow)"
                        animationDuration={600}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Legende Messqualität */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {(Object.keys(KLASSEN) as Klasse[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: KLASSEN_FARBE[k] }} />
                  {KLASSEN[k].label}
                </span>
              ))}
            </div>

            {/* Zeitraum-Auswertung */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Kennzahl label="Tiefst" wert={sicht.kz.zeitraum.tiefst ? kg1(sicht.kz.zeitraum.tiefst.kg) : "–"} einheit="kg" fuss={sicht.kz.zeitraum.tiefst ? formatDatum(sicht.kz.zeitraum.tiefst.datum) : undefined} />
              <Kennzahl label="Höchst" wert={sicht.kz.zeitraum.hoechst ? kg1(sicht.kz.zeitraum.hoechst.kg) : "–"} einheit="kg" fuss={sicht.kz.zeitraum.hoechst ? formatDatum(sicht.kz.zeitraum.hoechst.datum) : undefined} />
              <Kennzahl label="Im Zeitraum" wert={delta(sicht.kz.zeitraum.trendDelta)} einheit="kg" fuss="Trend Anfang → Ende" />
              <Kennzahl label="Vorperiode" wert={delta(sicht.kz.zeitraum.vorperiodeDelta)} einheit="kg" fuss="Median ggü. davor" />
              <Kennzahl label="Ø Qualität" wert={sicht.kz.zeitraum.qualitaet != null ? String(sicht.kz.zeitraum.qualitaet) : "–"} einheit="/100" />
              <Kennzahl label="Messungen" wert={String(sicht.kz.zeitraum.anzahl)} />
            </div>
          </div>
        )}
      </Card>

      {/* Messungen mit Messbedingungen */}
      {sicht && daten && daten.messungen.length > 0 && (
        <Card className="gh-auf">
          <KachelKopf
            icon={ClipboardList}
            ton="neutral"
            titel="Messungen"
            untertitel="Tippe auf eine Messung, um die Bedingungen zu ergänzen"
          />
          <ul className="-my-1 px-[calc(var(--card-spacing)-8px)]">
            {liste.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setProtokoll(m);
                    setProtokollOffen(true);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface"
                >
                  <div className="w-14 shrink-0">
                    <div className="stat-display text-[17px] leading-tight">{kg1(m.gewichtKg)}</div>
                    <div className="text-[10px] text-dim-foreground">kg</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {tagLang(m.zeitpunkt)} · {uhr(m.zeitpunkt)}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {m.qualitaet.widersprueche.length > 0 ? (
                        <span className="text-status-orange">
                          <AlertTriangle className="mr-1 inline size-3" />
                          widersprüchliche Angaben
                        </span>
                      ) : m.qualitaet.datenstatus === "vollstaendig" ? (
                        bedingungKurz(m)
                      ) : m.qualitaet.datenstatus === "keine_angaben" ? (
                        <span className="text-primary">Messbedingungen ergänzen</span>
                      ) : (
                        <span>
                          <span className="text-primary">unvollständig</span> · {bedingungKurz(m)}
                        </span>
                      )}
                    </div>
                  </div>
                  <QualitaetsBadge klasse={m.qualitaet.klasse} score={m.qualitaet.score} kurz />
                </button>
              </li>
            ))}
          </ul>
          {sicht.messungen.length > 8 && (
            <div className="px-(--card-spacing)">
              <button type="button" onClick={() => setAlleZeigen((v) => !v)} className="min-h-10 text-xs font-medium text-primary">
                {alleZeigen ? "Weniger anzeigen" : `Alle ${sicht.messungen.length} Messungen im Zeitraum anzeigen`}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Körperzusammensetzung — getrennt vom Gewichtstrend */}
      {daten && daten.komposition.some((r) => r.punkte.length > 0) && (
        <Card className="gh-auf">
          <KachelKopf icon={Scale} ton="violett" titel="Körperzusammensetzung" untertitel="Bioimpedanz · Tageswerte und 7-Tage-Median" />
          <div className="grid gap-3 px-(--card-spacing) sm:grid-cols-2">
            {daten.komposition
              .filter((r) => r.punkte.length > 0)
              .map((r) => (
                <KompositionKachel key={r.feld} reihe={r} von={von} />
              ))}
          </div>
          <p className="px-(--card-spacing) text-[11px] leading-snug text-dim-foreground">
            Körperfett, Körperwasser und Muskelmasse schätzt die Waage per Bioimpedanz. Diese reagiert stark auf
            Flüssigkeitshaushalt, Training und Tageszeit — deshalb zählen hier nur vergleichbare Messungen, und einzelne
            Tage sind wenig aussagekräftig.
          </p>
        </Card>
      )}

      {/* Wie der Score funktioniert */}
      {daten?.verfuegbar && (
        <Card className="gh-auf" size="sm">
          <button
            type="button"
            aria-expanded={erklaerung}
            onClick={() => setErklaerung((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-(--card-spacing) text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Info className="size-4 text-primary" /> So funktioniert die Messqualität
            </span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", erklaerung && "rotate-180")} />
          </button>
          {erklaerung && (
            <div className="space-y-3 px-(--card-spacing) text-[13px] leading-snug text-muted-foreground">
              <p>
                Gewicht schwankt im Tagesverlauf durch Essen, Trinken, Training, Schwitzen und Verdauung. Der Score (0–100)
                beschreibt, wie gut eine Messung mit standardisierten Bedingungen vergleichbar ist — er ist kein
                medizinischer Genauigkeitswert. Fehlende Angaben zählen nie als erfüllt.
              </p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {Object.values(KRITERIEN).map((k) => (
                  <li key={k.label} className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-1.5">
                    <span>{k.label}</span>
                    <span className="stat-mono text-foreground">{k.max}</span>
                  </li>
                ))}
              </ul>
              <p>
                Der Trend nimmt pro Tag die vergleichbarste Messung und bildet daraus einen gleitenden 7-Tage-Median
                (erst ab drei Tageswerten). Wenig vergleichbare Messungen bleiben als Punkt sichtbar, fliessen aber nicht
                ein. Es werden nie Kilogramm „korrigiert“ — alle gemessenen Werte bleiben unverändert.
              </p>
            </div>
          )}
        </Card>
      )}

      <Messprotokoll
        messung={protokoll}
        offen={protokollOffen}
        demo={demo}
        onClose={() => setProtokollOffen(false)}
        onGespeichert={lade}
      />
    </section>
  );
}

function KompositionKachel({ reihe, von }: { reihe: KompositionsReihe; von: string | null }) {
  const def = KOMPOSITION[reihe.feld];
  const punkte = reihe.punkte.filter((p) => von == null || p.datum >= von);
  const trend = reihe.trend.filter((p) => von == null || p.datum >= von);
  const letzter = reihe.trend.at(-1) ?? null;
  const daten = punkte.map((p) => ({
    t: mittagMs(p.datum),
    wert: p.wert,
    trend: trend.find((x) => x.datum === p.datum)?.wert ?? null,
  }));
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{def.label}</span>
        <span className="stat-display text-lg">
          {letzter ? letzter.wert.toFixed(def.dezimalen) : (punkte.at(-1)?.wert.toFixed(def.dezimalen) ?? "–")}
          <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{def.einheit}</span>
        </span>
      </div>
      <div className="mt-1 h-20">
        {daten.length < 2 ? (
          <div className="flex h-full items-center text-[11px] text-dim-foreground">Zu wenige Werte im Zeitraum.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={daten} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
              <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} hide />
              <Scatter dataKey="wert" fill="#b49cff" fillOpacity={0.45} isAnimationActive={false} />
              <Line dataKey="trend" type="monotone" stroke="#b49cff" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
