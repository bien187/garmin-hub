/**
 * Einheitlicher Diagramm-Baukasten („Understated Performance").
 *
 * Vorbild ist die Ansicht Aerobic Performance: Kennzahlen über dem
 * Diagramm, Umschalter klein und textig, Zeitraum rechts darüber, ruhige
 * Achsen ohne Linien, nur waagrechte Hilfslinien, eigener Tooltip, Legende
 * und Erklärung darunter. Alle Diagramme der App nutzen diese Werte, damit
 * sie gleich aussehen und sich gleich lesen.
 *
 * Recharts erkennt Achsen und Gitter am Komponententyp — deshalb gibt es
 * hier Props zum Spreizen (`<XAxis {...X_ACHSE} … />`) statt Wrapper.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Masse und Recharts-Props                                            */
/* ------------------------------------------------------------------ */

/** Höhe eines Hauptdiagramms */
export const DIAGRAMM_HOEHE = "h-56 md:h-64";
/** Höhe eines Nebendiagramms (z.B. Verteilung unter einem Hauptdiagramm) */
export const DIAGRAMM_HOEHE_KLEIN = "h-40";

export const DIAGRAMM_RAND = { top: 8, right: 8, bottom: 0, left: -6 } as const;

export const ACHSE_TICK = { fontSize: 10, fill: "var(--dim-foreground)" } as const;

/** Gemeinsame Achsen-Props: kleine, gedämpfte Beschriftung ohne Linien */
export const ACHSE = { tick: ACHSE_TICK, tickLine: false, axisLine: false } as const;
export const X_ACHSE = { ...ACHSE, minTickGap: 32 } as const;
export const Y_ACHSE = { ...ACHSE, width: 44 } as const;

/** Nur waagrechte, feine Hilfslinien */
export const GITTER = { vertical: false, stroke: "var(--border)", strokeOpacity: 0.7 } as const;

export const CURSOR_LINIE = { stroke: "rgb(255 255 255 / 15%)" } as const;
export const CURSOR_BALKEN = { fill: "rgb(255 255 255 / 4%)" } as const;

/** Hauptlinie (Trend, Messreihe) */
export const LINIE = { type: "monotone", strokeWidth: 2, dot: false, isAnimationActive: false } as const;
/** Nebenlinie: dünner, gestrichelt, gedämpft */
export const LINIE_NEBEN = {
  type: "monotone",
  strokeWidth: 1.5,
  strokeOpacity: 0.6,
  strokeDasharray: "4 4",
  dot: false,
  isAnimationActive: false,
} as const;
export const AKTIVER_PUNKT = { r: 3.5, strokeWidth: 0 } as const;
/** Fläche unter einer Linie (Höhenprofil, Stress): nur ein Hauch Farbe */
export const FLAECHE_DECKKRAFT = 0.12;
/** Referenz- und Grenzlinien */
export const REFERENZ_LINIE = { stroke: "var(--muted-foreground)", strokeOpacity: 0.6, strokeDasharray: "4 4" } as const;

/**
 * Feste Bedeutung der Farben in allen Diagrammen.
 * Hex-Werte für Canvas, CSS-Variablen für SVG.
 */
export const DIAGRAMM_FARBEN = {
  /** Laufen: Pace, Tempo, Geschwindigkeit */
  pace: "var(--coral)",
  /** Herzfrequenz */
  puls: "var(--status-red)",
  /** Fortschritt, Umfang, Fitness */
  fortschritt: "var(--primary)",
  /** Erholung, Schlaf, Ermüdung */
  erholung: "var(--blau)",
  /** Höhenprofil: neutral */
  hoehe: "var(--muted-foreground)",
  /** einzelne Messpunkte ohne eigene Bedeutung */
  neutral: "var(--muted-foreground)",
} as const;

export const DIAGRAMM_FARBEN_HEX = {
  pace: "#d69a72",
  puls: "#d27a72",
  hoehe: "#9aa5b3",
  text: "#9aa5b3",
  textHell: "#f0f2f4",
} as const;

/** Form für <Scatter shape={…}>: gefüllter Messpunkt */
export function messPunkt(farbe: string = DIAGRAMM_FARBEN.pace, deckkraft = 0.7) {
  return function Punkt(props: unknown) {
    const { cx, cy } = props as { cx?: number; cy?: number };
    if (cx == null || cy == null) return <g />;
    return <circle cx={cx} cy={cy} r={2.8} fill={farbe} fillOpacity={deckkraft} />;
  };
}

/** Form für <Scatter shape={…}>: hohler Punkt für geschätzte Werte */
export function hohlPunkt(farbe: string = DIAGRAMM_FARBEN.pace) {
  return function Hohl(props: unknown) {
    const { cx, cy } = props as { cx?: number; cy?: number };
    if (cx == null || cy == null) return <g />;
    return <circle cx={cx} cy={cy} r={2.8} fill="var(--card)" stroke={farbe} strokeOpacity={0.75} strokeWidth={1.2} />;
  };
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

export const TOOLTIP_STIL = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
} as const;

export interface TooltipZeile {
  label: string;
  wert: ReactNode;
  farbe?: string;
}

/**
 * Inhalt eines Diagramm-Tooltips: Datum oder Position klein, Hauptwert gross,
 * weitere Werte als Zeilen, ein Hinweis zuunterst.
 */
export function TooltipKarte({
  titel,
  wert,
  zeilen,
  hinweis,
}: {
  titel: ReactNode;
  wert?: ReactNode;
  zeilen?: TooltipZeile[];
  hinweis?: ReactNode;
}) {
  return (
    <div style={TOOLTIP_STIL} className="max-w-64 space-y-1">
      <div className="text-[11px] text-muted-foreground">{titel}</div>
      {wert != null && <div className="stat-display text-base">{wert}</div>}
      {zeilen && zeilen.length > 0 && (
        <div className="space-y-0.5">
          {zeilen.map((z) => (
            <div key={z.label} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {z.farbe && <span className="size-2 shrink-0 rounded-full" style={{ background: z.farbe }} />}
                {z.label}
              </span>
              <span className="stat-display">{z.wert}</span>
            </div>
          ))}
        </div>
      )}
      {hinweis && <div className="text-[11px] leading-snug text-muted-foreground">{hinweis}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Legende                                                             */
/* ------------------------------------------------------------------ */

export type LegendenArt = "punkt" | "ring" | "linie" | "strich" | "balken" | "flaeche";

export interface LegendenEintrag {
  art: LegendenArt;
  farbe: string;
  label: string;
  /** gedämpft (z.B. vergangene Wochen) */
  blass?: boolean;
}

function Symbol({ art, farbe, blass }: Omit<LegendenEintrag, "label">) {
  const o = blass ? 0.35 : 1;
  switch (art) {
    case "punkt":
      return <span className="size-2 rounded-full" style={{ background: farbe, opacity: blass ? 0.35 : 0.75 }} />;
    case "ring":
      return <span className="size-2 rounded-full border" style={{ borderColor: farbe, opacity: o }} />;
    case "linie":
      return <span className="h-0.5 w-4 rounded-full" style={{ background: farbe, opacity: o }} />;
    case "strich":
      return <span className="w-4 border-t border-dashed" style={{ borderColor: farbe, opacity: blass ? 0.35 : 0.7 }} />;
    case "balken":
      return <span className="h-2.5 w-2 rounded-[2px]" style={{ background: farbe, opacity: o }} />;
    case "flaeche":
      return <span className="h-2 w-4 rounded-[2px]" style={{ background: farbe, opacity: blass ? 0.15 : 0.3 }} />;
  }
}

/** Legende unter dem Diagramm */
export function Legende({ eintraege, className }: { eintraege: LegendenEintrag[]; className?: string }) {
  if (eintraege.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {eintraege.map((e) => (
        <span key={e.label} className="flex items-center gap-1.5">
          <Symbol art={e.art} farbe={e.farbe} blass={e.blass} />
          {e.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kennzahlen, Umschalter, Hinweis, Leerzustand                        */
/* ------------------------------------------------------------------ */

/** Kennzahl über einem Diagramm: Label, grosser Wert mit Einheit, Fusszeile */
export function Kennzahl({
  label,
  wert,
  einheit,
  fuss,
  ton,
}: {
  label: string;
  wert: ReactNode;
  einheit?: string;
  fuss?: ReactNode;
  /** Farbklasse des Werts (z.B. text-status-green) */
  ton?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("stat-display text-[20px] leading-none", ton)}>{wert}</span>
        {einheit && <span className="text-xs text-muted-foreground">{einheit}</span>}
      </div>
      {fuss != null && <div className="mt-1 truncate text-xs text-dim-foreground">{fuss}</div>}
    </div>
  );
}

/** Raster für zwei bis vier Kennzahlen (Handy 2 Spalten) */
export function Kennzahlen({ children, spalten = 4 }: { children: ReactNode; spalten?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-4",
        spalten === 4 && "sm:grid-cols-4",
        spalten === 3 && "sm:grid-cols-3"
      )}
    >
      {children}
    </div>
  );
}

/** Fehlender Wert in einer Kennzahl */
export const KeinWert = () => <span className="text-dim-foreground">–</span>;

/** Kleiner Umschalter für Kennzahlen oder Reihen (z.B. Distanz · Laufzeit · Pace) */
export function Segmente<T extends string>({
  optionen,
  wert,
  onChange,
  label,
  className,
}: {
  optionen: readonly { id: T; label: string }[];
  wert: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {optionen.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={wert === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-8 rounded-md px-2 text-xs transition-colors",
            wert === o.id ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Erklärung und Datenbasis unter einem Diagramm */
export function DiagrammHinweis({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground", className)}>
      {children}
    </div>
  );
}

/** Platzhalter in Diagrammhöhe, wenn keine Daten da sind */
export function DiagrammLeer({ children, hoehe = DIAGRAMM_HOEHE }: { children: ReactNode; hoehe?: string }) {
  return (
    <div className={cn("flex items-center justify-center px-4 text-center text-sm text-muted-foreground", hoehe)}>
      {children}
    </div>
  );
}

/** Pace-Achse: gleichmässige Ticks in 5/10/15/20/30/60 s (umgekehrt dargestellt) */
export function paceAchse(werte: number[], rand = 8): { domain: [number, number]; ticks: number[] } {
  if (werte.length === 0) return { domain: [300, 420], ticks: [300, 330, 360, 390, 420] };
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const schritt = [5, 10, 15, 20, 30, 60].find((s) => (max - min + 2 * rand) / s <= 5) ?? 60;
  const domain: [number, number] = [Math.floor((min - rand) / schritt) * schritt, Math.ceil((max + rand) / schritt) * schritt];
  const ticks: number[] = [];
  for (let v = domain[0]; v <= domain[1]; v += schritt) ticks.push(v);
  return { domain, ticks };
}

/** Gleichmässige Ticks für eine Werteachse (1/2/5er-Schritte, 3–5 Ticks) */
export function werteAchse(werte: number[], opt: { null?: boolean; rand?: number } = {}): { domain: [number, number]; ticks: number[] } {
  const gueltig = werte.filter((v) => Number.isFinite(v));
  if (gueltig.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  let min = Math.min(...gueltig);
  let max = Math.max(...gueltig);
  if (opt.null) min = Math.min(0, min);
  const rand = opt.rand ?? (max - min) * 0.08;
  if (!opt.null || min < 0) min -= rand;
  max += rand;
  if (max - min < 1e-9) {
    max += 1;
    min -= opt.null ? 0 : 1;
  }
  const roh = (max - min) / 4;
  const p = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => (max - min) / s <= 5) ?? 10 * p;
  const domain: [number, number] = [Math.floor(min / schritt) * schritt, Math.ceil(max / schritt) * schritt];
  const ticks: number[] = [];
  for (let v = domain[0]; v <= domain[1] + schritt * 1e-6; v += schritt) ticks.push(Math.round(v * 1000) / 1000);
  return { domain, ticks };
}
