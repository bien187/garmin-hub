"use client";

import { memo } from "react";
import { erschoepfungFarbe, MuskelId } from "@/lib/engine/muscle";
import { cn } from "@/lib/utils";

/**
 * Selbst gezeichnete Flat-Silhouette (vorne + hinten), jede Muskelgruppe ein
 * eigener Pfad. Färbung nach Rest-Erschöpfung 0–100 %.
 */

interface MuskelPfad {
  id: MuskelId;
  seite: "vorne" | "hinten";
  /** Pfad der linken Körperhälfte (wird gespiegelt) oder zentraler Pfad */
  d: string;
  zentral?: boolean;
}

// Koordinatensystem: 220 × 460 pro Figur, Körperachse x = 110
const PFADE: MuskelPfad[] = [
  /* ---- vorne ---- */
  { id: "nacken_trapez", seite: "vorne", d: "M93,64 L110,66 L110,80 L96,80 Q92,72 93,64 Z" },
  { id: "schultern", seite: "vorne", d: "M64,84 Q80,76 93,82 L91,108 Q72,110 61,100 Q60,90 64,84 Z" },
  { id: "brust", seite: "vorne", zentral: false, d: "M92,84 L110,87 L110,130 Q96,127 89,111 Q88,94 92,84 Z" },
  { id: "bizeps", seite: "vorne", d: "M60,104 Q70,112 76,110 L73,150 Q63,152 56,143 Q55,120 60,104 Z" },
  { id: "unterarme", seite: "vorne", d: "M55,147 Q64,155 73,152 L66,202 Q59,204 52,195 Q50,168 55,147 Z" },
  { id: "bauch", seite: "vorne", zentral: true, d: "M97,133 L123,133 L121,196 Q110,204 99,196 Z" },
  { id: "seitlicher_rumpf", seite: "vorne", d: "M88,130 L94,133 L96,194 L86,178 Q84,150 88,130 Z" },
  { id: "adduktoren", seite: "vorne", d: "M102,208 L109,212 L107,266 L99,258 Q99,228 102,208 Z" },
  { id: "quadrizeps", seite: "vorne", d: "M77,204 Q90,198 98,205 L96,290 Q87,299 78,291 Q73,240 77,204 Z" },
  { id: "schienbeine", seite: "vorne", d: "M83,312 L95,309 L93,384 L85,382 Q80,344 83,312 Z" },
  /* ---- hinten ---- */
  { id: "nacken_trapez", seite: "hinten", zentral: true, d: "M110,58 L138,82 Q126,104 110,112 Q94,104 82,82 Z" },
  { id: "schultern", seite: "hinten", d: "M64,84 Q80,76 92,82 L90,106 Q72,108 61,100 Q60,90 64,84 Z" },
  { id: "oberer_ruecken_lat", seite: "hinten", d: "M84,98 L110,116 L110,180 Q92,172 82,148 Q80,118 84,98 Z" },
  { id: "trizeps", seite: "hinten", d: "M60,104 Q70,112 76,110 L73,150 Q63,152 56,143 Q55,120 60,104 Z" },
  { id: "unterarme", seite: "hinten", d: "M55,147 Q64,155 73,152 L66,202 Q59,204 52,195 Q50,168 55,147 Z" },
  { id: "unterer_ruecken", seite: "hinten", zentral: true, d: "M98,184 L122,184 L120,214 L100,214 Z" },
  { id: "gesaess", seite: "hinten", d: "M85,216 Q108,209 109,218 L108,248 Q90,254 83,242 Q81,226 85,216 Z" },
  { id: "hamstrings", seite: "hinten", d: "M80,256 Q92,252 99,258 L96,322 Q87,329 79,320 Q75,282 80,256 Z" },
  { id: "waden", seite: "hinten", d: "M81,332 Q91,325 97,332 L93,390 Q86,395 80,388 Q77,356 81,332 Z" },
];

/** Basis-Silhouette (Kopf, Rumpf-Umriss, Arme, Beine) */
function Silhouette() {
  return (
    <g className="fill-muted/60">
      <circle cx="110" cy="36" r="21" />
      <path d="M92,60 L128,60 L131,82 Q148,78 158,88 Q166,104 162,130 Q158,158 150,200 L143,198 Q140,230 136,252 L140,300 Q141,360 136,392 L142,418 L118,418 L120,392 Q116,340 113,300 L107,300 Q104,340 100,392 L102,418 L78,418 L84,392 Q79,360 80,300 L84,252 Q80,230 77,198 L70,200 Q62,158 58,130 Q54,104 62,88 Q72,78 89,82 Z" />
    </g>
  );
}

interface BodyMapProps {
  werte: Partial<Record<MuskelId, number>>;
  onSelect?: (id: MuskelId) => void;
  ausgewaehlt?: MuskelId | null;
  mini?: boolean;
  className?: string;
}

export const BodyMap = memo(function BodyMap({
  werte,
  onSelect,
  ausgewaehlt,
  mini = false,
  className,
}: BodyMapProps) {
  const figur = (seite: "vorne" | "hinten") => (
    <svg
      viewBox="0 0 220 460"
      className={cn("h-full w-auto", mini ? "max-h-40" : "max-h-[420px]")}
      role="img"
      aria-label={`Muskelstatus ${seite}`}
    >
      <Silhouette />
      {PFADE.filter((p) => p.seite === seite).map((p) => {
        const wert = werte[p.id] ?? 0;
        const farbe = erschoepfungFarbe(wert);
        const istAktiv = ausgewaehlt === p.id;
        const gemeinsam = {
          fill: farbe,
          className: cn(
            "transition-opacity",
            onSelect && "cursor-pointer hover:opacity-80",
            istAktiv && "stroke-foreground"
          ),
          strokeWidth: istAktiv ? 2 : 0,
          onClick: onSelect ? () => onSelect(p.id) : undefined,
        };
        return (
          <g key={`${p.seite}-${p.id}`}>
            <path d={p.d} {...gemeinsam} />
            {!p.zentral && (
              <path d={p.d} transform="translate(220,0) scale(-1,1)" {...gemeinsam} />
            )}
          </g>
        );
      })}
      {!mini && (
        <text
          x="110"
          y="452"
          textAnchor="middle"
          className="fill-muted-foreground text-[13px]"
        >
          {seite === "vorne" ? "Vorne" : "Hinten"}
        </text>
      )}
    </svg>
  );

  return (
    <div className={cn("flex items-start justify-center gap-2", className)}>
      {figur("vorne")}
      {figur("hinten")}
    </div>
  );
});
