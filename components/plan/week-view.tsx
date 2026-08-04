"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Info,
  RefreshCw,
  Send,
  Watch,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Metronome } from "./metronome";
import { addTage, formatDatum, heuteIso, montagVon } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  return e.struktur != null && e.typ !== "ruhe" && e.typ !== "gtg";
}

interface PlanDaten {
  montag: string;
  phase: { nr: number; name: string; fokus: string[] };
  einheiten: PlanEinheit[];
  hinweise: string[];
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
};

export function WeekView() {
  const toast = useToast();
  const [woche, setWoche] = useState(() => montagVon(heuteIso()));
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [generiert, setGeneriert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);
  const [fehlgeschlagen, setFehlgeschlagen] = useState<string[]>([]);

  const lade = useCallback(async () => {
    const res = await fetch(`/api/plan?woche=${woche}`);
    if (res.ok) setDaten(await res.json());
  }, [woche]);

  useEffect(() => {
    setDaten(null);
    lade();
  }, [lade]);

  async function generiere() {
    setLaedt(true);
    setGeneriert(false);
    const res = await fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wochenstart: woche }),
    });
    setLaedt(false);
    if (res.ok) {
      setGeneriert(true);
      lade();
    } else {
      setMeldung("Generierung fehlgeschlagen — ist die Datenbank erreichbar?");
    }
  }

  async function pushe(id: string) {
    setMeldung("Sende an Garmin…");
    const res = await fetch(`/api/plan/${id}/push`, { method: "POST" });
    const data = await res.json();
    setMeldung(res.ok ? data.hinweis : (data.error ?? "Push fehlgeschlagen"));
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
        <Button variant="ghost" size="sm" onClick={() => setWoche(addTage(woche, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <div className="stat-display text-lg">
            {formatDatum(woche)} – {formatDatum(addTage(woche, 6))}
          </div>
          {daten && (
            <div className="text-xs text-primary">
              Phase {daten.phase.nr}: {daten.phase.name}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setWoche(addTage(woche, 7))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {meldung && (
        <div
          className="cursor-pointer rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
          onClick={() => setMeldung(null)}
        >
          {meldung}
        </div>
      )}

      {/* Hinweise der Adaptionslogik */}
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
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : daten.einheiten.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Für diese Woche ist noch kein Plan generiert.
          </p>
          <Button onClick={generiere} disabled={laedt}>
            <RefreshCw className={cn("size-4", laedt && "animate-spin")} />
            Woche generieren
          </Button>
        </div>
      ) : (
        <>
          {/* Sammel-Aktion: der einzige gefüllte Akzentbutton dieser Seite */}
          {teile && (teile.zuSenden.length > 0 || pushProgress) && (
            <Button
              className="w-full"
              disabled={pushProgress != null}
              onClick={() => setVorschau(true)}
            >
              {pushProgress ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Sende… {pushProgress.done}/{pushProgress.total}
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Alle an Garmin senden ({teile.zuSenden.length})
                </>
              )}
            </Button>
          )}

          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const datum = addTage(woche, i);
              const einheiten = daten.einheiten.filter((e) => e.datum === datum);
              if (einheiten.length === 0) return null;
              return (
                <div key={datum}>
                  <div
                    className={cn(
                      "mb-1 flex items-baseline gap-2 text-xs",
                      datum === heute ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <span className="stat-display text-sm">{WOCHENTAGE[i]}</span>
                    {formatDatum(datum)}
                    {datum === heute && <span className="font-medium">· heute</span>}
                  </div>
                  <div className="space-y-1.5">
                    {einheiten.map((e) => {
                      const istOffen = offen === e.id;
                      const kannPushen =
                        e.struktur != null && e.typ !== "ruhe" && e.typ !== "gtg";
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "rounded-xl border border-border border-l-4 bg-card",
                            TYP_FARBEN[e.typ] ?? "border-l-muted",
                            e.status === "absolviert" && "opacity-60"
                          )}
                        >
                          <button
                            className="flex w-full items-center gap-2.5 p-3 text-left"
                            onClick={() => setOffen(istOffen ? null : e.id)}
                          >
                            {e.status === "absolviert" ? (
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
                            {e.erwarteterTrimp != null && (
                              <span className="stat-mono text-[10px] text-muted-foreground">
                                ~{e.erwarteterTrimp} TRIMP
                              </span>
                            )}
                          </button>
                          {istOffen && (
                            <div className="space-y-2.5 border-t border-border/60 p-3 text-sm">
                              <p className="text-muted-foreground">{e.beschreibung}</p>
                              {/* Garmin-Sync-Flag pro Einheit + Status */}
                              {kannPushen && (
                                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span>An Garmin senden</span>
                                    {e.garminWorkoutId != null && (
                                      <span className="flex items-center gap-1 text-[10px] text-primary">
                                        <Check className="size-3" /> übertragen
                                      </span>
                                    )}
                                    {fehlgeschlagen.includes(e.id) && (
                                      <span className="text-[10px] text-status-red">
                                        Fehler
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
                                {e.status !== "absolviert" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setzeStatus(e.id, "absolviert")}
                                  >
                                    <Check className="size-4" /> Erledigt
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setzeStatus(e.id, "geplant")}
                                  >
                                    Zurücksetzen
                                  </Button>
                                )}
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
            <Button variant="ghost" size="sm" onClick={generiere} disabled={laedt}>
              <RefreshCw className={cn("size-4", laedt && "animate-spin")} />
              {generiert ? "Neu generiert" : "Woche neu generieren"}
            </Button>
          </div>
        </>
      )}

      {/* Vorschau vor dem Sammel-Senden */}
      <Dialog open={vorschau} onOpenChange={setVorschau}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>An Garmin senden</DialogTitle>
          </DialogHeader>
          {teile && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Diese {teile.zuSenden.length} Einheiten werden übertragen
                </div>
                <ul className="space-y-1">
                  {teile.zuSenden.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <Watch className="size-3.5 shrink-0 text-primary" />
                      <span className="flex-1 truncate">{e.titel}</span>
                      <span className="stat-mono text-[10px] text-muted-foreground">
                        {formatDatum(e.datum)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {teile.uebersprungen.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {teile.uebersprungen.length} Einheit(en) übersprungen (nicht für
                  Garmin markiert, z.B. Gym).
                </p>
              )}
              {teile.bereits.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {teile.bereits.length} bereits übertragen — werden nicht doppelt
                  angelegt.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setVorschau(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={!teile || teile.zuSenden.length === 0}
              onClick={() => teile && sendeAlle(teile.zuSenden.map((e) => e.id))}
            >
              <Send className="size-4" />
              Senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
