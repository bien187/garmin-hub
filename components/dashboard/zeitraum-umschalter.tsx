"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDatumLang } from "@/lib/format";
import { ZEITRAEUME, zeitraumVon, type Zeitraum } from "@/lib/engine/zeitachse";

/*
 * Gemeinsamer Zeitraum einer Verlaufs-Karte: Kartentitel und Untertitel
 * werden auf dem Server gerendert, der Umschalter sitzt im Client-Chart.
 * ZeitraumBereich hält den Zustand für beide, damit Überschrift und
 * sichtbarer Ausschnitt nie auseinanderlaufen.
 */
interface ZeitraumZustand {
  zeitraum: Zeitraum;
  setZeitraum: (z: Zeitraum) => void;
}

const ZeitraumKontext = createContext<ZeitraumZustand | null>(null);

export function ZeitraumBereich({ children }: { children: ReactNode }) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>("alles");
  return <ZeitraumKontext.Provider value={{ zeitraum, setZeitraum }}>{children}</ZeitraumKontext.Provider>;
}

/** Zeitraum der umgebenden Karte; ohne ZeitraumBereich lokal (Standard „Alles") */
export function useZeitraum(): ZeitraumZustand {
  const kontext = useContext(ZeitraumKontext);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("alles");
  return kontext ?? { zeitraum, setZeitraum };
}

const TITEL: Record<Zeitraum, string> = {
  alles: "seit Trainingsstart",
  "6m": "letzte 6 Monate",
  "90t": "letzte 90 Tage",
};

/** Kartentitel mit aktivem Zeitraum, z. B. „Fitness · seit Trainingsstart" */
export function ZeitraumTitel({ name }: { name: string }) {
  const { zeitraum } = useZeitraum();
  return (
    <>
      {name} · {TITEL[zeitraum]}
    </>
  );
}

/** Datumsspanne des aktiven Zeitraums: „27. Juni 2026 – heute" */
export function ZeitraumSpanne({ start, heute }: { start: string | null; heute: string }) {
  const { zeitraum } = useZeitraum();
  const von = zeitraumVon(zeitraum, heute);
  const ab = von != null && (start == null || von > start) ? von : start;
  return <>{ab ? `${formatDatumLang(ab)} – ` : ""}heute</>;
}

/**
 * Segment-Umschalter 90 Tage / 6 Mon. / Alles für Verlaufs-Charts.
 * Zeigt nur Zeiträume, die sich von „Alles" unterscheiden; bleibt nur
 * „Alles" übrig, rendert er nichts. Touch-Ziele ≥ 44 px (min-h-11).
 */
export function ZeitraumUmschalter({
  wert,
  verfuegbar,
  onChange,
  className,
}: {
  wert: Zeitraum;
  verfuegbar: readonly Zeitraum[];
  onChange: (z: Zeitraum) => void;
  className?: string;
}) {
  const optionen = ZEITRAEUME.filter((z) => verfuegbar.includes(z.id));
  if (optionen.length < 2) return null;
  return (
    <div role="group" aria-label="Zeitraum" className={cn("flex w-fit rounded-lg bg-muted p-0.5", className)}>
      {optionen.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={wert === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-11 min-w-11 whitespace-nowrap rounded-md px-3 text-[13px] transition-colors",
            wert === o.id ? "bg-background font-semibold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
