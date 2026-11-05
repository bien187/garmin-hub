"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Flag,
  Info,
  RefreshCw,
  Send,
  Trophy,
  Watch,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SheetShell } from "@/components/ui/sheet-confirm";
import { useToast } from "@/components/ui/toast";
import { Metronome } from "./metronome";
import { EpCheckliste } from "./ep-checkliste";
import { addTage, formatDatum, formatDatumLang, heuteIso, montagVon } from "@/lib/format";
import { cn } from "@/lib/utils";
import { taperRegelFuerTag } from "@/lib/engine/taper";
import { istEpTag, REGENERATION_BIS, TAPER_START } from "@/lib/ep/konstanten";

interface PlanEinheit {
  id: string;
  datum: string;
  typ: string;
  titel: string;
  beschreibung: string | null;
  struktur: { sport?: string; metronom?: boolean } | null;
  status: string;
  garminWorkoutId: number | null;
  syncToGarmin: boolean;
  erwarteterTrimp: number | null;
}

/** Kann diese Einheit überhaupt als Garmin-Workout übertragen werden? */
function istPushbar(e: PlanEinheit): boolean {
  // EP-Tage gehen nie an die Uhr (serverseitig ebenfalls abgelehnt)
  return e.struktur != null && e.typ !== "ruhe" && e.typ !== "gtg" && e.typ !== "ep";
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
  phase: { nr: number; name: string; fokus: string[] };
  einheiten: PlanEinheit[];
  hinweise: string[];
  anpassungen?: PlanAnpassung[];
  nichtVerfuegbar: string[];
}

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const TYP_FARBEN: Record<string, string> = {
  intervalle: "border-l-status-red",
  huegel_intervalle: "border-l-status-red",
  lastlauf: "border-l-status-orange",
  probe_ep: "border-l-status-orange",
  langer_lauf: "border-l-chart-2",
  lauf_z2: "border-l-status-green",
  kraft: "border-l-primary",
  klimmzuege: "border-l-primary",
  rumpf: "border-l-status-yellow",
  gtg: "border-l-muted-foreground",
  ruhe: "border-l-muted",
  ep: "border-l-ep",
};

/** Erledigt/Zurücksetzen für einen Plan-Eintrag (aufgeklappte Ansicht und EP-Sheet) */
function StatusKnopf({
  status,
  onSetze,
  className,
}: {
  status: string;
  onSetze: (status: "absolviert" | "geplant") => void;
  className?: string;
}) {
  return status !== "absolviert" ? (
    <Button size="sm" variant="ghost" className={className} onClick={() => onSetze("absolviert")}>
      <Check className="size-4" /> Erledigt
    </Button>
  ) : (
    <Button size="sm" variant="ghost" className={className} onClick={() => onSetze("geplant")}>
      Zurücksetzen
    </Button>
  );
}

export function WeekView() {
  const toast = useToast();
  const [woche, setWoche] = useState(() => montagVon(heuteIso()));
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [generiert, setGeneriert] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);
  const [fehlgeschlagen, setFehlgeschlagen] = useState<string[]>([]);
  const [anpassungenWeg, setAnpassungenWeg] = useState(false);
  /** EP-Eintrag für das Checklisten-Sheet (bleibt beim Schliessen für die Animation stehen) */
  const [epEintrag, setEpEintrag] = useState<PlanEinheit | null>(null);
  const [epOffen, setEpOffen] = useState(false);

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

  async function verfuegbarkeit(datum: string, verfuegbar: boolean) {
    if (!daten) return;
    setLaedt(true);
    try {
      const sperren = verfuegbar ? daten.nichtVerfuegbar.filter(d => d !== datum) : [...daten.nichtVerfuegbar, datum];
      const res = await fetch('/api/plan/generate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({wochenstart:woche, nichtVerfuegbar:sperren})});
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Speichern fehlgeschlagen.');
      await lade();
      toast({message:'Verfügbarkeit gespeichert und Plan angepasst.'});
    } catch (e) {
      toast({message:e instanceof Error ? e.message : 'Speichern fehlgeschlagen.', variant:'error'});
    } finally { setLaedt(false); }
  }

  async function generiere() {
    setLaedt(true);
    setGeneriert(false);
    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wochenstart: woche }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Generierung fehlgeschlagen.');
      setGeneriert(true);
      await lade();
    } catch (e) {
      toast({message: e instanceof Error ? e.message : 'Generierung fehlgeschlagen.', variant:'error'});
    } finally { setLaedt(false); }
  }

  async function pushe(id: string) {
    const res = await fetch(`/api/plan/${id}/push`, { method: "POST" });
    const data = await res.json();
    toast({
      message: res.ok
        ? (data.hinweis ?? "An Garmin gesendet.")
        : (data.error ?? "Push fehlgeschlagen"),
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
    setDaten((d) =>
      d
        ? { ...d, einheiten: d.einheiten.map((e) => (e.id === id ? { ...e, syncToGarmin } : e)) }
        : d
    );
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
    const zuSenden = einheiten.filter(
      (e) => e.syncToGarmin && istPushbar(e) && !e.garminWorkoutId
    );
    const bereits = einheiten.filter((e) => e.garminWorkoutId != null);
    const uebersprungen = einheiten.filter(
      (e) => istPushbar(e) && !e.syncToGarmin
    );
    return { zuSenden, bereits, uebersprungen };
  }

  /** Sammel-Übertragung: sequenziell, mit Fortschritt + Teilfehler-Bericht */
  async function sendeAlle(ids: string[]) {
    setVorschau(false);
    setPushProgress({ done: 0, total: ids.length });
    const neuFehlgeschlagen: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const res = await fetch(`/api/plan/${ids[i]}/push`, { method: "POST" }).catch(
        () => null
      );
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
      onAction: neuFehlgeschlagen.length
        ? () => sendeAlle(neuFehlgeschlagen)
        : undefined,
    });
  }

  const heute = heuteIso();
  const teile = daten ? partition(daten.einheiten) : null;

  return (
    <div className="space-y-3">
      {/* Wochen-Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={laedt || pushProgress != null} onClick={() => setWoche(addTage(woche, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <div className="stat-display text-[17px]">
            {formatDatum(woche)} – {formatDatum(addTage(woche, 6))}
          </div>
          {daten && (
            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
              Phase {daten.phase.nr}: {daten.phase.name}
              {daten.phase.nr === 3 && TAPER_START > woche && TAPER_START <= addTage(woche, 6) && (
                <> · Taper ab {formatDatum(TAPER_START)}</>
              )}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" disabled={laedt || pushProgress != null} onClick={() => setWoche(addTage(woche, 7))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {daten && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <h2 className="text-sm font-medium">Deine Trainingstage</h2>
          <p className="text-xs text-muted-foreground">Markiere, wann du trainieren kannst. Der Plan passt sich direkt an.</p>
          {WOCHENTAGE.map((tag, i) => {
            const datum = addTage(woche, i);
            const gym = [0, 3, 6].includes(i);
            const ep = istEpTag(datum);
            const frei = !daten.nichtVerfuegbar.includes(datum);
            return <div key={datum} className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>{tag} · {formatDatum(datum)}</span>
              {ep ? <span className="text-xs font-medium text-ep">EP · fix</span> :
                gym ? <span className="text-xs text-muted-foreground">Gymtag · fix</span> :
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  {frei ? 'Training möglich' : 'Keine Zeit'}
                  <Switch aria-label={tag + ' ' + formatDatum(datum) + ': Training möglich'} checked={frei} disabled={laedt || pushProgress != null || datum < heute} onCheckedChange={v => verfuegbarkeit(datum, v)} />
                </label>}
            </div>;
          })}
        </div>
      )}

      {/* Automatische Anpassungen: oranges Flag über dem Plan. Bewusst
          prominenter als die Hinweise — hier hat sich der Plan wirklich
          geändert, nicht nur ein Rat dazugestellt. */}
      {anpassungen.length > 0 && (
        <div className="rounded-lg border border-status-orange/40 bg-status-orange/10 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Flag className="mt-0.5 size-4 shrink-0 text-status-orange" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xs font-semibold text-status-orange">
                Plan automatisch angepasst
              </div>
              {anpassungen.map((a) => (
                <div key={a.einheitId} className="text-xs">
                  <span className="font-medium">{formatDatum(a.datum)}:</span>{" "}
                  «{a.alterTitel}» → «{a.neuerTitel}»
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
              className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hinweise der Adaptionslogik (bleiben inline, §11.3) */}
      {daten && daten.hinweise.length > 0 && (
        <div className="space-y-1.5">
          {daten.hinweise.map((h, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
            >
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {h}
            </div>
          ))}
        </div>
      )}

      {!daten ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : daten.einheiten.length === 0 && woche > REGENERATION_BIS ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Kein Trainingsplan nach der EP, bis neue Ziele gesetzt sind.
          </p>
        </div>
      ) : daten.einheiten.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Für diese Woche ist noch kein Plan generiert.
          </p>
          <Button onClick={generiere} disabled={laedt || pushProgress != null}>
            <RefreshCw className={cn("size-4", laedt && "animate-spin")} />
            Woche generieren
          </Button>
        </div>
      ) : (
        <>
          {/* Sammel-Aktion: der einzige gefüllte Akzentbutton dieser Seite.
              Während des Sendens ist der Button die Fortschrittsanzeige
              (Füllung von links + „x von y"). */}
          {teile && (teile.zuSenden.length > 0 || pushProgress) && (
            <button
              disabled={pushProgress != null}
              onClick={() => setVorschau(true)}
              className="relative flex min-h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-90"
            >
              {pushProgress && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/20"
                  style={{
                    width: `${(pushProgress.done / pushProgress.total) * 100}%`,
                    transition: "width var(--dur-base) var(--ease-base)",
                  }}
                />
              )}
              <span className="relative flex items-center gap-2">
                {pushProgress ? (
                  <>
                    <RefreshCw className="size-4 gh-spin" />
                    {pushProgress.done} von {pushProgress.total}
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Alle an Garmin senden ({teile.zuSenden.length})
                  </>
                )}
              </span>
            </button>
          )}

          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const datum = addTage(woche, i);
              const einheiten = daten.einheiten.filter((e) => e.datum === datum);
              if (einheiten.length === 0) return null;
              // Taper-Begründung pro Tag: reine Funktion, kein DB-Feld nötig
              const regel = taperRegelFuerTag(datum);
              const epTag = istEpTag(datum);
              return (
                <div key={datum}>
                  <div
                    className={cn(
                      "mb-1 flex items-baseline gap-2 text-xs",
                      epTag ? "text-ep" : datum === heute ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <span className="stat-display text-sm">{WOCHENTAGE[i]}</span>
                    {formatDatum(datum)}
                    {datum === heute && <span className="font-medium">· heute</span>}
                  </div>
                  {regel && (
                    <p className="mb-1.5 text-[11px] leading-snug text-dim-foreground">
                      <span className={cn("font-medium", epTag ? "text-ep" : "text-muted-foreground")}>
                        {regel.label}:
                      </span>{" "}
                      {regel.begruendung}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {einheiten.map((e) => {
                      const istOffen = offen === e.id;
                      const kannPushen = istPushbar(e);
                      const istEp = e.typ === "ep";
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "rounded-xl border border-border border-l-4 bg-card",
                            TYP_FARBEN[e.typ] ?? "border-l-muted",
                            istEp && "bg-ep/10",
                            e.status === "absolviert" && "opacity-60"
                          )}
                        >
                          {/* EP-Einträge öffnen die Checkliste im Sheet statt aufzuklappen */}
                          <button
                            className="flex w-full items-center gap-2.5 p-3 text-left"
                            aria-haspopup={istEp ? "dialog" : undefined}
                            aria-expanded={istEp ? undefined : istOffen}
                            onClick={() => {
                              if (istEp) {
                                setEpEintrag(e);
                                setEpOffen(true);
                              } else setOffen(istOffen ? null : e.id);
                            }}
                          >
                            {istEp ? (
                              <Trophy className="size-4 shrink-0 text-ep" aria-label="EP-Tag" />
                            ) : e.status === "absolviert" ? (
                              <Check className="size-4 shrink-0 text-status-green" />
                            ) : e.status === "verpasst" ? (
                              <X className="size-4 shrink-0 text-status-red" />
                            ) : e.status === "gepusht" ? (
                              <Watch className="size-4 shrink-0 text-primary" />
                            ) : (
                              <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span
                              className={cn(
                                "flex-1 text-sm font-medium",
                                e.status === "absolviert" && "line-through"
                              )}
                            >
                              {e.titel}
                            </span>
                            {e.erwarteterTrimp != null && !istEp && (
                              <span className="stat-mono text-[10px] text-muted-foreground">
                                ~{e.erwarteterTrimp} TRIMP
                              </span>
                            )}
                            {istEp && (
                              <span className="text-[11px] font-medium text-ep">Checkliste</span>
                            )}
                          </button>
                          {!istEp && (
                          <div
                            className="grid transition-[grid-template-rows]"
                            style={{
                              gridTemplateRows: istOffen ? "1fr" : "0fr",
                              transitionDuration: "var(--dur-base)",
                            }}
                          >
                           <div className="min-h-0 overflow-hidden">
                            <div className="space-y-2.5 border-t border-border/60 p-3 text-sm">
                              <p className="text-muted-foreground">{e.beschreibung}</p>
                              {/* Garmin-Sync-Flag pro Einheit + Status */}
                              {kannPushen && (
                                <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                                  <div className="flex items-center gap-2.5">
                                    <span>An Garmin senden</span>
                                    {/* Status immer Icon + Text, nie nur Farbe */}
                                    {e.garminWorkoutId != null ? (
                                      <span className="flex items-center gap-1 text-[10px] text-status-green">
                                        <Check className="size-3" /> übertragen
                                      </span>
                                    ) : fehlgeschlagen.includes(e.id) ? (
                                      <span className="flex items-center gap-1 text-[10px] text-status-red">
                                        <X className="size-3" /> Fehler
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 text-[10px] text-dim-foreground">
                                        <CircleDashed className="size-3" /> offen
                                      </span>
                                    )}
                                  </div>
                                  <Switch
                                    checked={e.syncToGarmin}
                                    onCheckedChange={(v) => toggleSync(e.id, v)}
                                  />
                                </div>
                              )}
                              {e.struktur?.metronom && <Metronome />}
                              <div className="flex flex-wrap gap-1.5">
                                {kannPushen && e.garminWorkoutId == null && (
                                  <Button size="sm" variant="secondary" onClick={() => pushe(e.id)}>
                                    <Watch className="size-4" />
                                    Auf die Uhr laden
                                  </Button>
                                )}
                                {kannPushen && e.garminWorkoutId != null && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => entfernenVonUhr(e.id)}
                                  >
                                    <X className="size-4" /> Von der Uhr entfernen
                                  </Button>
                                )}
                                <StatusKnopf
                                  status={e.status}
                                  onSetze={(st) => setzeStatus(e.id, st)}
                                />
                              </div>
                            </div>
                           </div>
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={generiere} disabled={laedt || pushProgress != null}>
              <RefreshCw className={cn("size-4", laedt && "animate-spin")} />
              {generiert ? "Neu generiert" : "Woche neu generieren"}
            </Button>
          </div>
        </>
      )}

      {/* EP-Tag: Checkliste statt der normalen Eintragsansicht */}
      <SheetShell open={epOffen} onClose={() => setEpOffen(false)} labelledBy="ep-sheet-titel">
        {epEintrag && (
          <div className="flex max-h-[85dvh] flex-col">
            <div className="flex items-start gap-3 px-5 pb-3 pt-1.5">
              <Trophy className="mt-0.5 size-5 shrink-0 text-ep" />
              <div className="min-w-0 flex-1">
                <h2 id="ep-sheet-titel" className="text-base font-semibold">
                  {epEintrag.titel}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {formatDatumLang(epEintrag.datum)} · Checkliste
                </p>
              </div>
              <button
                onClick={() => setEpOffen(false)}
                aria-label="Checkliste schliessen"
                className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
              {epEintrag.beschreibung && (
                <p className="mb-3 text-sm text-muted-foreground">{epEintrag.beschreibung}</p>
              )}
              <EpCheckliste key={epEintrag.datum} datum={epEintrag.datum} />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <p className="min-w-0 flex-1 text-[11px] text-dim-foreground">
                  Fixer Termin — wird vom Generator nie überschrieben und nicht an die Uhr gesendet.
                </p>
                <StatusKnopf
                  status={epEintrag.status}
                  className="min-h-11"
                  onSetze={(st) => {
                    setzeStatus(epEintrag.id, st);
                    setEpEintrag({ ...epEintrag, status: st });
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </SheetShell>

      {/* Vorschau vor dem Sammel-Senden (Bottom-Sheet) */}
      <SheetShell open={vorschau} onClose={() => setVorschau(false)}>
        <div className="px-5 pt-1.5">
          <h2 className="text-base font-semibold">An Garmin senden</h2>
          {teile && (
            <div className="mt-3 space-y-3 text-sm">
              <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-dim-foreground">
                Diese {teile.zuSenden.length} Einheiten werden übertragen
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {teile.zuSenden.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <Watch className="size-3.5 shrink-0 text-primary" />
                    <span className="flex-1 truncate">{e.titel}</span>
                    <span className="stat-mono text-[10px] text-dim-foreground">
                      {formatDatum(e.datum)}
                    </span>
                  </li>
                ))}
              </ul>
              {teile.uebersprungen.length > 0 && (
                <p className="text-[13px] text-dim-foreground">
                  {teile.uebersprungen.length} Einheit(en) übersprungen (nicht für
                  Garmin markiert, z.B. Gym).
                </p>
              )}
              {teile.bereits.length > 0 && (
                <p className="text-[13px] text-dim-foreground">
                  {teile.bereits.length} bereits übertragen — werden nicht doppelt
                  angelegt.
                </p>
              )}
            </div>
          )}
          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => setVorschau(false)}
              className="min-h-11 flex-1 rounded-lg bg-muted text-sm font-medium"
            >
              Abbrechen
            </button>
            <button
              disabled={!teile || teile.zuSenden.length === 0}
              onClick={() => teile && sendeAlle(teile.zuSenden.map((e) => e.id))}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
