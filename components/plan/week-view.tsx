"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Flag,
  Flame,
  Info,
  RefreshCw,
  Send,
  Sun,
  Target,
  Watch,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SheetShell } from "@/components/ui/sheet-confirm";
import { useToast } from "@/components/ui/toast";
import { Pill } from "@/components/ui/pill";
import { Ring } from "@/components/ui/fortschritt";
import { EinheitIcon, einheitRand } from "@/components/sport-icon";
import { DemoDeaktiviert, useIstDemo } from "@/components/basis-pfad";
import { addTage, formatDatum, heuteIso, montagVon } from "@/lib/format";
import { cn } from "@/lib/utils";
import { geplanteDauerS, intensitaet, strukturZeilen, type StrukturLose } from "@/lib/engine/einheit";
import { istSperrbar, wochentagIndex, FREIE_TAGE, GYM_TAGE, RUHE_TAG } from "@/lib/engine/verfuegbarkeit";
import type { Trainingsblock } from "@/lib/engine/block";

interface PlanEinheit {
  id: string;
  datum: string;
  typ: string;
  titel: string;
  beschreibung: string | null;
  struktur: StrukturLose | null;
  status: string;
  garminWorkoutId: number | null;
  syncToGarmin: boolean;
  erwarteterTrimp: number | null;
}

/** Kann diese Einheit überhaupt als Garmin-Workout übertragen werden? */
function istPushbar(e: PlanEinheit): boolean {
  return e.struktur != null && e.typ !== "ruhe" && e.typ !== "gtg";
}

/** Ein automatischer Eingriff der laufenden Plan-Anpassung */
interface PlanAnpassung {
  einheitId: string;
  datum: string;
  alterTitel: string;
  neuerTitel: string;
  grund: string;
  bereitsGepusht: boolean;
}

interface PlanDaten {
  montag: string;
  block: Trainingsblock;
  /** Woche vor dem Programmstart: neutral und schreibgeschützt */
  archiv: boolean;
  einheiten: PlanEinheit[];
  hinweise: string[];
  anpassungen?: PlanAnpassung[];
  nichtVerfuegbar: string[];
}

const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Rolle eines Wochentags im festen Rhythmus */
function tagesRolle(i: number): string {
  if (GYM_TAGE.includes(i)) return "Gym";
  if (i === 1) return "Intervalle";
  if (i === 2) return "Zone 2";
  if (i === RUHE_TAG) return "Ruhetag";
  return "frei";
}

/** Erledigt/Zurücksetzen für einen Plan-Eintrag */
function StatusKnopf({
  status,
  onSetze,
}: {
  status: string;
  onSetze: (status: "absolviert" | "geplant") => void;
}) {
  return status !== "absolviert" ? (
    <Button size="sm" variant="secondary" className="min-h-10 rounded-xl" onClick={() => onSetze("absolviert")}>
      <Check className="size-4" /> Erledigt
    </Button>
  ) : (
    <Button size="sm" variant="ghost" className="min-h-10 rounded-xl" onClick={() => onSetze("geplant")}>
      Zurücksetzen
    </Button>
  );
}

function StatusPill({ e, fehler }: { e: PlanEinheit; fehler: boolean }) {
  if (e.status === "absolviert") return <Pill ton="lime" icon={Check}>erledigt</Pill>;
  if (e.status === "verpasst") return <Pill ton="rot" icon={X}>verpasst</Pill>;
  if (fehler) return <Pill ton="rot" icon={X}>Fehler</Pill>;
  if (e.garminWorkoutId != null || e.status === "gepusht") return <Pill ton="neutral" icon={Watch}>auf der Uhr</Pill>;
  return null;
}

export function WeekView() {
  const toast = useToast();
  // Demo: nur ansehen — nichts generieren, senden oder abhaken
  const demo = useIstDemo();
  const [woche, setWoche] = useState(() => montagVon(heuteIso()));
  const [tageOffen, setTageOffen] = useState(false);
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [generiert, setGeneriert] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);
  const [fehlgeschlagen, setFehlgeschlagen] = useState<string[]>([]);
  const [anpassungenWeg, setAnpassungenWeg] = useState(false);

  const lade = useCallback(async () => {
    const res = await fetch(`/api/plan?woche=${woche}`);
    if (res.ok) setDaten(await res.json());
  }, [woche]);

  useEffect(() => {
    setDaten(null);
    setAnpassungenWeg(false); // beim Wochenwechsel wieder zeigen
    lade();
  }, [lade]);

  const anpassungen = anpassungenWeg ? [] : (daten?.anpassungen ?? []);
  const schreibgeschuetzt = demo || (daten?.archiv ?? false);

  async function verfuegbarkeit(datum: string, verfuegbar: boolean) {
    if (!daten) return;
    setLaedt(true);
    try {
      const sperren = verfuegbar ? daten.nichtVerfuegbar.filter((d) => d !== datum) : [...daten.nichtVerfuegbar, datum];
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wochenstart: woche, nichtVerfuegbar: sperren }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Speichern fehlgeschlagen.");
      await lade();
      toast({ message: "Verfügbarkeit gespeichert und Plan angepasst." });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Speichern fehlgeschlagen.", variant: "error" });
    } finally {
      setLaedt(false);
    }
  }

  async function generiere() {
    setLaedt(true);
    setGeneriert(false);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wochenstart: woche }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Generierung fehlgeschlagen.");
      setGeneriert(true);
      await lade();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Generierung fehlgeschlagen.", variant: "error" });
    } finally {
      setLaedt(false);
    }
  }

  async function pushe(id: string) {
    const res = await fetch(`/api/plan/${id}/push`, { method: "POST" });
    const data = await res.json();
    toast({
      message: res.ok ? (data.hinweis ?? "An Garmin gesendet.") : (data.error ?? "Push fehlgeschlagen"),
      variant: res.ok ? "default" : "error",
    });
    lade();
  }

  async function setzeStatus(id: string, status: string) {
    await fetch(`/api/plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    lade();
  }

  /** Garmin-Sync-Flag pro Einheit umschalten */
  async function toggleSync(id: string, syncToGarmin: boolean) {
    setDaten((d) => (d ? { ...d, einheiten: d.einheiten.map((e) => (e.id === id ? { ...e, syncToGarmin } : e)) } : d));
    await fetch(`/api/plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncToGarmin }),
    }).catch(() => {});
  }

  /** Übertragung einer Einheit rückgängig machen */
  async function entfernenVonUhr(id: string) {
    const res = await fetch(`/api/plan/${id}/unpush`, { method: "POST" });
    if (res.ok) toast({ message: "Von der Uhr entfernt." });
    else toast({ message: "Entfernen fehlgeschlagen.", variant: "error" });
    lade();
  }

  /** Einheiten, die beim Sammel-Senden übertragen bzw. übersprungen werden */
  function partition(einheiten: PlanEinheit[]) {
    const zuSenden = einheiten.filter((e) => e.syncToGarmin && istPushbar(e) && !e.garminWorkoutId && e.datum >= heute);
    const bereits = einheiten.filter((e) => e.garminWorkoutId != null);
    const uebersprungen = einheiten.filter((e) => istPushbar(e) && !e.syncToGarmin);
    return { zuSenden, bereits, uebersprungen };
  }

  /** Sammel-Übertragung: sequenziell, mit Fortschritt + Teilfehler-Bericht */
  async function sendeAlle(ids: string[]) {
    setVorschau(false);
    setPushProgress({ done: 0, total: ids.length });
    const neuFehlgeschlagen: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const res = await fetch(`/api/plan/${ids[i]}/push`, { method: "POST" }).catch(() => null);
      const ok = res?.ok && (await res.json().catch(() => ({})))?.ok;
      if (!ok) neuFehlgeschlagen.push(ids[i]);
      setPushProgress({ done: i + 1, total: ids.length });
      await new Promise((r) => setTimeout(r, 400)); // Garmin schonen
    }
    setPushProgress(null);
    setFehlgeschlagen(neuFehlgeschlagen);
    await lade();
    const erfolg = ids.length - neuFehlgeschlagen.length;
    toast({
      message:
        neuFehlgeschlagen.length === 0
          ? `${erfolg} Einheiten an Garmin gesendet. Uhr synchronisieren.`
          : `${erfolg} gesendet, ${neuFehlgeschlagen.length} fehlgeschlagen.`,
      variant: neuFehlgeschlagen.length === 0 ? "default" : "error",
      actionLabel: neuFehlgeschlagen.length ? "Fehlgeschlagene erneut" : undefined,
      onAction: neuFehlgeschlagen.length ? () => sendeAlle(neuFehlgeschlagen) : undefined,
    });
  }

  const heute = heuteIso();
  const teile = daten && !daten.archiv ? partition(daten.einheiten) : null;
  const training = daten?.einheiten.filter((e) => e.typ !== "ruhe") ?? [];
  const erledigt = training.filter((e) => e.status === "absolviert").length;
  const geplanteMin = Math.round(
    training.reduce((s, e) => s + (geplanteDauerS(e.struktur) ?? 0), 0) / 60
  );
  const trimp = training.reduce((s, e) => s + (e.erwarteterTrimp ?? 0), 0);
  // Als Nächstes: erste offene Trainingseinheit ab heute
  const naechste = daten?.archiv
    ? null
    : (training.find((e) => e.datum >= heute && (e.status === "geplant" || e.status === "gepusht")) ?? null);
  const ziel = daten?.block;

  return (
    <div className="space-y-4">
      {/* Kopf: Wochenwahl, Block, Fortschritt */}
      <section className="flaeche-hero relative overflow-hidden rounded-xl p-4 shadow-card ring-1 ring-white/[0.06] md:p-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Vorherige Woche"
            disabled={laedt || pushProgress != null}
            onClick={() => setWoche(addTage(woche, -7))}
            className="flex size-11 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-white/[0.12] disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 text-center">
            <div className="text-lg font-semibold tracking-tight">
              {formatDatum(woche)} – {formatDatum(addTage(woche, 6))}
            </div>
            {daten && (
              <div className="mt-0.5 text-[11px] font-semibold tracking-[0.08em] text-primary uppercase">
                {daten.archiv ? "Archiv" : `${daten.block.name} · ${daten.block.fokus}`}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Nächste Woche"
            disabled={laedt || pushProgress != null}
            onClick={() => setWoche(addTage(woche, 7))}
            className="flex size-11 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-white/[0.12] disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {daten && !daten.archiv && training.length > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <Ring wert={erledigt} max={training.length} groesse={64} dicke={7} label={`${erledigt} von ${training.length} Einheiten erledigt`}>
              <span className="stat-display text-base leading-none">
                {erledigt}/{training.length}
              </span>
            </Ring>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[13px] leading-snug text-foreground/85">
                <Target className="mr-1 inline size-3.5 text-primary" />
                Ziel: Laufleistung, Ausdauer und allgemeine Fitness verbessern.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {geplanteMin > 0 && <Pill icon={Clock3}>~{geplanteMin} Min Laufen</Pill>}
                {trimp > 0 && <Pill icon={Flame}>~{Math.round(trimp)} TRIMP</Pill>}
                {ziel?.entlastung && <Pill ton="neutral">Entlastungswoche</Pill>}
              </div>
            </div>
          </div>
        )}
      </section>

      {daten?.archiv && (
        <div className="flex items-start gap-2.5 rounded-xl bg-surface px-4 py-3 text-[13px] text-muted-foreground">
          <Archive className="mt-0.5 size-4 shrink-0" />
          <p>
            Diese Woche liegt vor dem Start des aktuellen Programms. Die Einträge sind neutral und schreibgeschützt
            dargestellt; deine Aktivitäten findest du unter Aktivitäten.
          </p>
        </div>
      )}

      {/* Verfügbarkeit: nur die Lauftage Di/Mi lassen sich sperren */}
      {daten && !daten.archiv && (
        <div className="rounded-xl bg-card shadow-card ring-1 ring-white/[0.055]">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
            aria-expanded={tageOffen}
            aria-controls="trainingstage-liste"
            onClick={() => setTageOffen((o) => !o)}
          >
            <span>
              <span className="block text-sm font-medium">Deine Lauftage</span>
              {!tageOffen && (
                <span className="block text-xs text-muted-foreground">
                  {(() => {
                    const gesperrt = daten.nichtVerfuegbar.length;
                    return gesperrt === 0
                      ? "Di und Mi verfügbar · bei Terminen anpassen"
                      : `${gesperrt} ${gesperrt === 1 ? "Lauftag" : "Lauftage"} ohne Zeit · zum Anpassen öffnen`;
                  })()}
                </span>
              )}
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", tageOffen && "rotate-180")} />
          </button>
          {tageOffen && (
            <div id="trainingstage-liste" className="space-y-1 px-4 pb-3">
              <p className="pb-1 text-xs text-muted-foreground">
                Gym (Mo/Do), Ruhetag (Fr) und das freie Wochenende sind fix. Hast du Di oder Mi keine Zeit, verteilt der
                Plan die Läufe neu.
              </p>
              {KURZ.map((tag, i) => {
                const datum = addTage(woche, i);
                const frei = !daten.nichtVerfuegbar.includes(datum);
                return (
                  <div key={datum} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                    <span>
                      {tag} · {formatDatum(datum)}
                    </span>
                    {istSperrbar(datum) ? (
                      <label className="flex min-h-11 items-center gap-2 text-xs">
                        {frei ? "Training möglich" : "Keine Zeit"}
                        <Switch
                          aria-label={tag + " " + formatDatum(datum) + ": Training möglich"}
                          checked={frei}
                          disabled={demo || laedt || pushProgress != null || datum < heute}
                          onCheckedChange={(v) => verfuegbarkeit(datum, v)}
                        />
                      </label>
                    ) : (
                      <span className="text-xs text-muted-foreground">{tagesRolle(i)} · fix</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Automatische Anpassungen: prominenter als Hinweise — hier hat sich der Plan geändert */}
      {anpassungen.length > 0 && (
        <div className="rounded-xl border border-status-orange/35 bg-status-orange/10 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Flag className="mt-0.5 size-4 shrink-0 text-status-orange" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xs font-semibold text-status-orange">Plan automatisch angepasst</div>
              {anpassungen.map((a) => (
                <div key={a.einheitId} className="text-xs">
                  <span className="font-medium">{formatDatum(a.datum)}:</span> «{a.alterTitel}» → «{a.neuerTitel}»
                  <div className="text-muted-foreground">{a.grund}</div>
                  {a.bereitsGepusht && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-status-orange">
                      <Watch className="size-3" />
                      Liegt noch in der alten Fassung auf der Uhr — neu senden.
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setAnpassungenWeg(true)}
              aria-label="Hinweis ausblenden"
              className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hinweise der Adaptionslogik */}
      {daten && daten.hinweise.length > 0 && (
        <div className="space-y-1.5">
          {daten.hinweise.map((h, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl bg-primary/[0.07] px-4 py-2.5 text-xs leading-snug">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {h}
            </div>
          ))}
        </div>
      )}

      {!daten ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : daten.einheiten.length === 0 && !daten.archiv ? (
        <div className="rounded-xl border border-dashed border-white/12 px-6 py-10 text-center">
          <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
            Für diese Woche ist noch kein Plan erstellt. Der Generator baut deinen Rhythmus: Gym, Intervalle, lockerer
            Lauf, Gym — Freitag Ruhe, Wochenende frei.
          </p>
          <button
            onClick={generiere}
            disabled={demo || laedt || pushProgress != null}
            className="flaeche-lime inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", laedt && "gh-spin")} />
            Woche generieren
          </button>
          {demo && <DemoDeaktiviert className="mt-2" />}
        </div>
      ) : (
        <>
          {/* Sammel-Aktion: während des Sendens Fortschrittsanzeige */}
          {!demo && teile && (teile.zuSenden.length > 0 || pushProgress) && (
            <button
              disabled={pushProgress != null}
              onClick={() => setVorschau(true)}
              className="flaeche-lime relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-semibold shadow-glow transition-transform active:scale-[0.99] disabled:opacity-90"
            >
              {pushProgress && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/25"
                  style={{
                    width: `${(pushProgress.done / pushProgress.total) * 100}%`,
                    transition: "width var(--dur-base) var(--ease-base)",
                  }}
                />
              )}
              <span className="relative flex items-center gap-2">
                {pushProgress ? (
                  <>
                    <RefreshCw className="gh-spin size-4" />
                    {pushProgress.done} von {pushProgress.total}
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Läufe an Garmin senden ({teile.zuSenden.length})
                  </>
                )}
              </span>
            </button>
          )}

          <ol className="space-y-4">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const datum = addTage(woche, i);
              const einheiten = daten.einheiten.filter((e) => e.datum === datum);
              const istHeute = datum === heute;
              const freiTag = FREIE_TAGE.includes(wochentagIndex(datum));
              return (
                <li key={datum} className="gh-auf" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="mb-1.5 flex items-baseline gap-2 px-1">
                    <span className={cn("text-sm font-semibold", istHeute ? "text-primary" : "text-foreground")}>
                      {WOCHENTAGE[i]}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDatum(datum)}</span>
                    {istHeute && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        heute
                      </span>
                    )}
                  </div>

                  {einheiten.length === 0 ? (
                    freiTag && !daten.archiv ? (
                      <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-4 py-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-status-yellow">
                          <Sun className="size-[18px]" />
                        </span>
                        <div className="min-w-0 text-sm">
                          <div className="font-medium">Frei</div>
                          <div className="text-xs text-muted-foreground">
                            Keine Pflicht — Lust auf einen lockeren Lauf? Du entscheidest.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-surface/50 px-4 py-3 text-xs text-dim-foreground">Kein Eintrag</div>
                    )
                  ) : (
                    <div className="space-y-2">
                      {einheiten.map((e) => (
                        <EinheitKarte
                          key={e.id}
                          e={e}
                          offen={offen === e.id}
                          naechste={naechste?.id === e.id}
                          schreibgeschuetzt={schreibgeschuetzt}
                          demo={demo}
                          fehler={fehlgeschlagen.includes(e.id)}
                          onToggle={() => setOffen(offen === e.id ? null : e.id)}
                          onPush={() => pushe(e.id)}
                          onUnpush={() => entfernenVonUhr(e.id)}
                          onSync={(v) => toggleSync(e.id, v)}
                          onStatus={(st) => setzeStatus(e.id, st)}
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {!schreibgeschuetzt && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="min-h-10 rounded-xl" onClick={generiere} disabled={laedt || pushProgress != null}>
                <RefreshCw className={cn("size-4", laedt && "gh-spin")} />
                {generiert ? "Neu generiert" : "Woche neu generieren"}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Vorschau vor dem Sammel-Senden (Bottom-Sheet) */}
      <SheetShell open={vorschau} onClose={() => setVorschau(false)}>
        <div className="px-5 pt-1.5">
          <h2 className="text-base font-semibold">An Garmin senden</h2>
          {teile && (
            <div className="mt-3 space-y-3 text-sm">
              <div className="kachel-titel">Diese {teile.zuSenden.length} Einheiten werden übertragen</div>
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {teile.zuSenden.map((e) => (
                  <li key={e.id} className="flex items-center gap-2.5">
                    <EinheitIcon typ={e.typ} groesse="sm" />
                    <span className="flex-1 truncate">{e.titel}</span>
                    <span className="stat-mono text-[11px] text-dim-foreground">{formatDatum(e.datum)}</span>
                  </li>
                ))}
              </ul>
              {teile.uebersprungen.length > 0 && (
                <p className="text-[13px] text-dim-foreground">
                  {teile.uebersprungen.length} Einheit(en) übersprungen (nicht für Garmin markiert, z. B. Gym).
                </p>
              )}
              {teile.bereits.length > 0 && (
                <p className="text-[13px] text-dim-foreground">
                  {teile.bereits.length} bereits übertragen — werden nicht doppelt angelegt.
                </p>
              )}
            </div>
          )}
          <div className="mt-4 flex gap-2.5">
            <button onClick={() => setVorschau(false)} className="min-h-11 flex-1 rounded-xl bg-surface text-sm font-medium">
              Abbrechen
            </button>
            <button
              disabled={!teile || teile.zuSenden.length === 0}
              onClick={() => teile && sendeAlle(teile.zuSenden.map((e) => e.id))}
              className="flaeche-lime flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              <Send className="size-4" />
              Senden
            </button>
          </div>
        </div>
      </SheetShell>
    </div>
  );
}

/** Eine Einheit als Karte: Kopf mit Icon/Kennzahlen, aufklappbar mit Details und Aktionen */
function EinheitKarte({
  e,
  offen,
  naechste,
  schreibgeschuetzt,
  demo,
  fehler,
  onToggle,
  onPush,
  onUnpush,
  onSync,
  onStatus,
}: {
  e: PlanEinheit;
  offen: boolean;
  naechste: boolean;
  schreibgeschuetzt: boolean;
  demo: boolean;
  fehler: boolean;
  onToggle: () => void;
  onPush: () => void;
  onUnpush: () => void;
  onSync: (v: boolean) => void;
  onStatus: (s: "absolviert" | "geplant") => void;
}) {
  const kannPushen = istPushbar(e);
  const dauerS = geplanteDauerS(e.struktur);
  const intens = intensitaet(e.typ);
  const zeilen = strukturZeilen(e.struktur);
  const erledigt = e.status === "absolviert";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-white/[0.055] transition-shadow",
        naechste && "shadow-glow ring-primary/40",
        erledigt && "opacity-75"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", einheitRand(e.typ))} />
      <button
        type="button"
        className="flex w-full items-center gap-3 py-3 pr-3 pl-4 text-left"
        aria-expanded={offen}
        onClick={onToggle}
      >
        <EinheitIcon typ={e.typ} />
        <div className="min-w-0 flex-1">
          {naechste && (
            <div className="text-[10px] font-semibold tracking-[0.08em] text-primary uppercase">Als Nächstes</div>
          )}
          <div className={cn("text-[15px] leading-snug font-medium", erledigt && "line-through decoration-white/30")}>
            {e.titel}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {dauerS != null && (
              <span className="stat-mono text-[11px] text-muted-foreground">~{Math.round(dauerS / 60)} Min</span>
            )}
            {intens && intens.stufe > 0 && (
              <span
                className={cn(
                  "text-[11px] font-medium",
                  intens.stufe >= 3 ? "text-coral" : intens.stufe === 1 ? "text-primary" : "text-muted-foreground"
                )}
              >
                {dauerS != null ? "· " : ""}
                {intens.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill e={e} fehler={fehler} />
          {!erledigt && e.status !== "verpasst" && e.garminWorkoutId == null && !fehler && (
            <CircleDashed className="size-4 text-dim-foreground" aria-label="offen" />
          )}
        </div>
      </button>

      <div
        className="grid transition-[grid-template-rows]"
        style={{ gridTemplateRows: offen ? "1fr" : "0fr", transitionDuration: "var(--dur-base)" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 border-t border-white/[0.06] py-3 pr-4 pl-5 text-sm">
            {e.beschreibung && <p className="leading-snug text-muted-foreground">{e.beschreibung}</p>}
            {zeilen.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-surface px-3 py-2.5">
                {zeilen.map((z, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span>{z}</span>
                  </li>
                ))}
              </ul>
            )}
            {kannPushen && !schreibgeschuetzt && (
              <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                <span>An Garmin senden</span>
                <Switch disabled={demo} checked={e.syncToGarmin} onCheckedChange={onSync} />
              </div>
            )}
            {demo ? (
              <DemoDeaktiviert />
            ) : schreibgeschuetzt ? null : (
              <div className="flex flex-wrap gap-1.5">
                {kannPushen && e.garminWorkoutId == null && (
                  <Button size="sm" variant="secondary" className="min-h-10 rounded-xl" onClick={onPush}>
                    <Watch className="size-4" />
                    Auf die Uhr laden
                  </Button>
                )}
                {kannPushen && e.garminWorkoutId != null && (
                  <Button size="sm" variant="ghost" className="min-h-10 rounded-xl" onClick={onUnpush}>
                    <X className="size-4" /> Von der Uhr entfernen
                  </Button>
                )}
                {e.typ !== "ruhe" && <StatusKnopf status={e.status} onSetze={onStatus} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
