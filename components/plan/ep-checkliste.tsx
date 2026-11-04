"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, Clock, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  checklisteFuer,
  fortschritt,
  fruehstueckFenster,
  istGueltigeStartzeit,
  leseZustand,
  type ChecklistenZustand,
} from "@/lib/ep/checkliste";
import { cn } from "@/lib/utils";

/**
 * Speicherzustand je EP-Tag, modulweit statt pro Komponenteninstanz: Wird das
 * Sheet geschlossen und wieder geöffnet, während ein PUT noch läuft, übernimmt
 * die neue Instanz denselben Sender. So gibt es pro Tag nur eine Sende-Schlange
 * (nacheinander, immer der neueste vollständige Stand), und ein noch laufender
 * PUT wird nicht als Fehler angezeigt.
 */
interface Speicherstand {
  /** neuester lokaler Stand */
  stand: ChecklistenZustand;
  /** lokal neuer als der Server (noch zu senden) */
  offen: boolean;
  /** ein PUT ist unterwegs */
  laeuft: boolean;
  /** der letzte Versuch ist gescheitert */
  fehler: boolean;
}

const speicherJeTag = new Map<string, Speicherstand>();
const beobachterJeTag = new Map<string, Set<() => void>>();

function melde(datum: string) {
  beobachterJeTag.get(datum)?.forEach((f) => f());
}

function beobachte(datum: string, f: () => void): () => void {
  let set = beobachterJeTag.get(datum);
  if (!set) beobachterJeTag.set(datum, (set = new Set()));
  set.add(f);
  return () => {
    set.delete(f);
  };
}

function merke(datum: string, z: ChecklistenZustand) {
  const e = speicherJeTag.get(datum);
  if (e) {
    e.stand = z;
    e.offen = true;
  } else {
    speicherJeTag.set(datum, { stand: z, offen: true, laeuft: false, fehler: false });
  }
}

/** Sendet den neuesten Stand; läuft schon ein PUT, holt dieser ihn danach ab. */
async function sendeTag(datum: string) {
  const e = speicherJeTag.get(datum);
  if (!e || e.laeuft || !e.offen) return;
  e.laeuft = true;
  e.fehler = false;
  melde(datum);
  try {
    while (e.offen) {
      e.offen = false;
      const z = e.stand;
      const res = await fetch("/api/ep-checkliste", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datum, ...z }),
        keepalive: true, // läuft weiter, wenn das Sheet währenddessen schliesst
      });
      if (!res.ok) throw new Error();
    }
  } catch {
    e.offen = true;
    e.fehler = true;
  } finally {
    e.laeuft = false;
    melde(datum);
  }
}

/** Startzeit-Änderungen gesammelt speichern (Tippen im Zeitfeld) */
const STARTZEIT_VERZOEGERUNG_MS = 600;

/**
 * EP-Checkliste für einen EP-Tag (Inhalte: lib/ep/checkliste.ts).
 * Abhaken wird optimistisch angezeigt und im Hintergrund gespeichert
 * (PUT /api/ep-checkliste, immer der vollständige Stand, nacheinander).
 * Schlägt das fehl, bleibt der lokale Stand stehen und lässt sich erneut senden.
 */
export function EpCheckliste({ datum }: { datum: string }) {
  const gruppen = useMemo(() => checklisteFuer(datum) ?? [], [datum]);
  const [zustand, setZustand] = useState<ChecklistenZustand | null>(null);
  const [startzeitEingabe, setStartzeitEingabe] = useState("");
  const [ladeFehler, setLadeFehler] = useState(false);

  const abonniere = useCallback((f: () => void) => beobachte(datum, f), [datum]);
  const speichert = useSyncExternalStore(
    abonniere,
    () => speicherJeTag.get(datum)?.laeuft ?? false,
    () => false
  );
  const speicherFehler = useSyncExternalStore(
    abonniere,
    () => speicherJeTag.get(datum)?.fehler ?? false,
    () => false
  );

  const aktuell = useRef<ChecklistenZustand | null>(null);
  const timer = useRef<number | null>(null);

  const uebernehme = useCallback((z: ChecklistenZustand) => {
    aktuell.current = z;
    setZustand(z);
    setStartzeitEingabe(z.startzeit);
  }, []);

  const lade = useCallback(async () => {
    setLadeFehler(false);
    const e = speicherJeTag.get(datum);
    if (e && (e.offen || e.laeuft || e.fehler)) {
      // Lokaler Stand ist neuer als der Server (unterwegs oder gescheitert): nicht überschreiben
      uebernehme(e.stand);
      return;
    }
    try {
      const res = await fetch(`/api/ep-checkliste?datum=${datum}`);
      if (!res.ok) throw new Error();
      uebernehme(leseZustand(gruppen, await res.json()));
    } catch {
      setLadeFehler(true);
    }
  }, [datum, gruppen, uebernehme]);

  useEffect(() => {
    lade();
  }, [lade]);

  const aendere = useCallback(
    (z: ChecklistenZustand, verzoegert = false) => {
      aktuell.current = z;
      setZustand(z);
      merke(datum, z);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = null;
      if (verzoegert) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          sendeTag(datum);
        }, STARTZEIT_VERZOEGERUNG_MS);
      } else {
        sendeTag(datum);
      }
    },
    [datum]
  );

  // Beim Schliessen eine noch wartende Startzeit-Änderung sofort senden
  useEffect(
    () => () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
        sendeTag(datum);
      }
    },
    [datum]
  );

  // Basis ist immer der neueste lokale Stand (auch bei schnellem Doppel-Tippen)
  function toggle(id: string) {
    const z = aktuell.current;
    if (!z) return;
    const abgehakt = z.abgehakt.includes(id)
      ? z.abgehakt.filter((x) => x !== id)
      : [...z.abgehakt, id];
    aendere({ ...z, abgehakt });
  }

  function startzeitGeaendert(wert: string) {
    setStartzeitEingabe(wert);
    const z = aktuell.current;
    if (z && istGueltigeStartzeit(wert) && wert !== z.startzeit) {
      aendere({ ...z, startzeit: wert }, true);
    }
  }

  if (ladeFehler) {
    return (
      <div className="rounded-lg border border-status-red/40 bg-status-red/10 p-3 text-sm">
        <p>Checkliste konnte nicht geladen werden.</p>
        <button
          type="button"
          onClick={lade}
          className="mt-2 flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium"
        >
          <RefreshCw className="size-4" /> Erneut laden
        </button>
      </div>
    );
  }

  if (!zustand) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Checkliste wird geladen">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-4 w-1/3" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const { erledigt, gesamt } = fortschritt(gruppen, zustand.abgehakt);
  const fenster = fruehstueckFenster(zustand.startzeit);
  const abgehakt = new Set(zustand.abgehakt);

  return (
    <div className="space-y-4">
      {/* Startzeit + Frühstück-Zeitfenster */}
      <div className="rounded-lg border border-ep/30 bg-ep/5 p-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <Clock className="size-4 text-ep" /> Startzeit
          </span>
          <input
            type="time"
            value={startzeitEingabe}
            onChange={(e) => startzeitGeaendert(e.target.value)}
            onBlur={() => setStartzeitEingabe(zustand.startzeit)}
            className="stat-mono min-h-11 rounded-lg border border-border bg-background px-3 text-base"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Frühstück zwischen{" "}
          <span className="stat-mono font-medium text-foreground">
            {fenster.von}
            {fenster.vonVortag && " (Vortag)"}
          </span>{" "}
          und{" "}
          <span className="stat-mono font-medium text-foreground">
            {fenster.bis}
            {fenster.bisVortag && " (Vortag)"}
          </span>{" "}
          (2–3 h vor Start).
        </p>
      </div>

      {/* Fortschritt */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium" aria-live="polite">
            {erledigt} von {gesamt} erledigt
          </span>
          {speichert && <span className="text-dim-foreground">speichert…</span>}
        </div>
        <Progress value={gesamt > 0 ? (erledigt / gesamt) * 100 : 0} className="h-2" />
      </div>

      {speicherFehler && (
        <div className="flex items-start gap-2 rounded-lg border border-status-red/40 bg-status-red/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-red" />
          <div className="min-w-0 flex-1">
            <p>Nicht gespeichert. Deine Häkchen bleiben hier erhalten.</p>
            <button
              type="button"
              onClick={() => sendeTag(datum)}
              disabled={speichert}
              className="mt-1.5 flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium"
            >
              <RefreshCw className="size-4" /> Erneut speichern
            </button>
          </div>
        </div>
      )}

      {gruppen.map((g) => {
        const fertig = g.punkte.filter((p) => abgehakt.has(p.id)).length;
        return (
          <section key={g.id} aria-labelledby={`${g.id}-titel`}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3
                id={`${g.id}-titel`}
                className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                {g.titel}
              </h3>
              <span className="stat-mono text-[10px] text-dim-foreground">
                {fertig}/{g.punkte.length}
              </span>
            </div>
            <ul className="space-y-0.5">
              {g.punkte.map((p) => {
                const aktiv = abgehakt.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={aktiv}
                      onClick={() => toggle(p.id)}
                      className="flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors active:bg-muted"
                    >
                      <span
                        className={cn(
                          "mt-px flex size-5 shrink-0 items-center justify-center rounded-md border",
                          aktiv
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/50"
                        )}
                      >
                        {aktiv && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", aktiv && "text-muted-foreground line-through")}>
                          {p.text}
                        </span>
                        {p.hinweis && (
                          <span className="mt-0.5 block text-xs leading-snug text-dim-foreground">
                            {p.hinweis}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-[11px] leading-snug text-dim-foreground">
        Ernährungshinweise sind allgemeine Vorschläge, keine Vorgaben. Halte dich an das, was du im
        Training gut vertragen hast.
      </p>
    </div>
  );
}
