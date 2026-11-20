"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { SheetShell } from "@/components/ui/sheet-confirm";
import { DemoDeaktiviert } from "@/components/basis-pfad";
import {
  bewerteNeu,
  KLASSEN,
  type BewerteteMessung,
  type Messbedingungen,
  type Tageszeit,
} from "@/lib/engine/gewicht";
import { cn } from "@/lib/utils";
import { QualitaetsBadge } from "./gewicht-qualitaet";

const TAGESZEIT: Record<Tageszeit, string> = {
  morgens: "Morgens",
  mittags: "Mittags",
  abends: "Abends",
  nachts: "Nachts",
};

/** Zeitspannen als Auswahl — gespeichert wird ein repräsentativer Minutenwert */
const SPANNEN: { label: string; min: number }[] = [
  { label: "< 1 h", min: 30 },
  { label: "1–2 h", min: 90 },
  { label: "2–4 h", min: 180 },
  { label: "> 4 h", min: 360 },
];

function spanneVon(min: number | null): number | null {
  if (min == null) return null;
  if (min < 60) return 30;
  if (min < 120) return 90;
  if (min < 240) return 180;
  return 360;
}

function Wahl<T extends string | number | boolean>({
  label,
  wert,
  optionen,
  onWahl,
  deaktiviert,
}: {
  label: string;
  wert: T | null;
  optionen: { label: string; wert: T }[];
  onWahl: (v: T | null) => void;
  deaktiviert?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-medium">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {optionen.map((o) => {
          const aktiv = wert === o.wert;
          return (
            <button
              key={String(o.wert)}
              type="button"
              role="radio"
              aria-checked={aktiv}
              disabled={deaktiviert}
              onClick={() => onWahl(aktiv ? null : o.wert)}
              className={cn(
                "min-h-10 min-w-12 rounded-md border px-3 text-[13px] transition-colors disabled:opacity-50",
                aktiv
                  ? "border-primary/70 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          );
        })}
        <span className="flex min-h-10 items-center px-1 text-[11px] text-dim-foreground">
          {wert == null ? "keine Angabe" : ""}
        </span>
      </div>
    </div>
  );
}

const JA_NEIN = [
  { label: "Ja", wert: true },
  { label: "Nein", wert: false },
];

/**
 * „Wie war deine Messung?" — ergänzt fehlende Messbedingungen einer Wägung.
 * Zeitstempel, Tageszeit und Trainingsabstand stammen automatisch aus
 * Garmin und werden nicht abgefragt. Tippen auf eine aktive Auswahl setzt
 * sie zurück auf „keine Angabe".
 */
export function Messprotokoll({
  messung,
  offen,
  demo,
  onClose,
  onGespeichert,
}: {
  messung: BewerteteMessung | null;
  offen: boolean;
  demo: boolean;
  onClose: () => void;
  onGespeichert: () => void;
}) {
  const [b, setB] = useState<Messbedingungen | null>(messung?.bedingungen ?? null);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (messung) setB(messung.bedingungen);
    setFehler(null);
  }, [messung]);

  if (!messung || !b) return <SheetShell open={offen} onClose={onClose}>{null}</SheetShell>;

  const vorschau = bewerteNeu(messung, b);
  const setze = (patch: Partial<Messbedingungen>) => setB({ ...b, ...patch });
  const zeit = new Date(messung.zeitpunkt).toLocaleString("de-CH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
  const sport = vorschau.kriterien.find((k) => k.id === "sport");

  async function speichern() {
    if (!b || !messung) return;
    setSpeichert(true);
    setFehler(null);
    try {
      const res = await fetch("/api/gewicht/bedingungen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messungId: messung.id, ...b }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Speichern fehlgeschlagen.");
      onGespeichert();
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <SheetShell open={offen} onClose={onClose} labelledBy="messprotokoll-titel">
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-start gap-3 px-5 pt-1.5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="messprotokoll-titel" className="text-base font-medium">
              Wie war deine Messung?
            </h2>
            <p className="text-xs text-muted-foreground">
              {zeit} · <span className="font-medium text-foreground tabular-nums">{messung.gewichtKg.toFixed(1)} kg</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Schliessen"
            className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4">
          {/* Automatisch bekannt — wird nicht abgefragt */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">
              {TAGESZEIT[vorschau.tageszeit]} (aus dem Zeitstempel)
              {sport?.herkunft === "garmin" ? ` · ${sport.hinweis} (Garmin)` : ""}
            </span>
          </div>

          <Wahl label="Nüchtern?" wert={b.nuechtern} optionen={JA_NEIN} onWahl={(v) => setze({ nuechtern: v })} deaktiviert={demo} />
          <Wahl
            label="Frühstück"
            wert={b.vorFruehstueck}
            optionen={[
              { label: "Vor dem Frühstück", wert: true },
              { label: "Nach dem Frühstück", wert: false },
            ]}
            onWahl={(v) => setze({ vorFruehstueck: v })}
            deaktiviert={demo}
          />
          <Wahl label="Nach dem Toilettengang?" wert={b.nachToilette} optionen={JA_NEIN} onWahl={(v) => setze({ nachToilette: v })} deaktiviert={demo} />
          <Wahl
            label="Letzte Mahlzeit vor"
            wert={spanneVon(b.mahlzeitVorMin)}
            optionen={SPANNEN.map((s) => ({ label: s.label, wert: s.min }))}
            onWahl={(v) => setze({ mahlzeitVorMin: v })}
            deaktiviert={demo}
          />
          <Wahl
            label="Zuletzt getrunken vor"
            wert={spanneVon(b.fluessigkeitVorMin)}
            optionen={SPANNEN.map((s) => ({ label: s.label, wert: s.min }))}
            onWahl={(v) => setze({ fluessigkeitVorMin: v })}
            deaktiviert={demo}
          />
          {sport?.herkunft !== "garmin" || b.trainingVorMin != null ? (
            <Wahl
              label="Letztes Training vor"
              wert={spanneVon(b.trainingVorMin)}
              optionen={SPANNEN.map((s) => ({ label: s.label, wert: s.min }))}
              onWahl={(v) => setze({ trainingVorMin: v })}
              deaktiviert={demo}
            />
          ) : (
            <button
              type="button"
              disabled={demo}
              onClick={() => setze({ trainingVorMin: messung.trainingAbstandMin ?? 360 })}
              className="text-xs font-medium text-primary"
            >
              Trainingsabstand selbst angeben
            </button>
          )}
          <Wahl label="Bad oder Sauna in den 2 h davor?" wert={b.badSauna} optionen={JA_NEIN} onWahl={(v) => setze({ badSauna: v })} deaktiviert={demo} />

          {/* Live-Vorschau des Scores */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Vergleichbarkeit</span>
              <QualitaetsBadge klasse={vorschau.klasse} score={vorschau.score} />
            </div>
            <ul className="grid grid-cols-1 gap-1 text-[12px] sm:grid-cols-2">
              {vorschau.kriterien.map((k) => (
                <li key={k.id} className="flex items-center gap-1.5">
                  {k.status === "erfuellt" ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : k.status === "unbekannt" ? (
                    <span className="flex size-3.5 shrink-0 items-center justify-center text-dim-foreground">?</span>
                  ) : (
                    <X className="size-3.5 shrink-0 text-status-orange" />
                  )}
                  <span className={cn(k.status === "unbekannt" ? "text-dim-foreground" : "text-muted-foreground")}>
                    {k.label}
                  </span>
                  <span className="stat-mono ml-auto text-dim-foreground">
                    {k.punkte}/{k.max}
                  </span>
                </li>
              ))}
            </ul>
            {vorschau.widersprueche.map((w) => (
              <p key={w} className="text-[12px] text-status-orange">
                {w}
              </p>
            ))}
            <p className="text-[11px] leading-snug text-dim-foreground">
              {KLASSEN[vorschau.klasse].label}. Der Score bewertet nur die Vergleichbarkeit mit standardisierten
              Bedingungen, nicht die Genauigkeit der Waage. Das gemessene Gewicht bleibt unverändert.
            </p>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 pt-3 pb-1">
          {demo ? (
            <DemoDeaktiviert />
          ) : (
            <>
              {fehler && <p className="mb-2 text-xs text-status-red">{fehler}</p>}
              <button
                onClick={speichern}
                disabled={speichert}
                className="flaeche-lime flex min-h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium disabled:opacity-60"
              >
                <Check className="size-4" />
                {speichert ? "Speichert…" : "Angaben speichern"}
              </button>
            </>
          )}
        </div>
      </div>
    </SheetShell>
  );
}
