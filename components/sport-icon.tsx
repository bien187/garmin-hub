import {
  Bike,
  CircleDot,
  Dumbbell,
  Footprints,
  Moon,
  Mountain,
  MountainSnow,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { sportart, type Sportart } from "@/lib/engine/sport";
import { kategorie, type Kategorie } from "@/lib/engine/einheit";
import { cn } from "@/lib/utils";

/*
 * Ein Icon-System für Aktivitäten (Garmin-Typen) und Plan-Einheiten:
 * nur die Glyphe, gedeckt eingefärbt — Laufen Orange, Kraft Salbei,
 * Velo/Schwimmen Blau, alles andere neutral. Keine Farbflächen.
 */

const SPORT: Record<Sportart, { icon: LucideIcon; klasse: string }> = {
  lauf: { icon: Footprints, klasse: "text-coral" },
  trail: { icon: MountainSnow, klasse: "text-coral" },
  kraft: { icon: Dumbbell, klasse: "text-primary" },
  velo: { icon: Bike, klasse: "text-blau" },
  wandern: { icon: Mountain, klasse: "text-muted-foreground" },
  schwimmen: { icon: Waves, klasse: "text-blau" },
  sonstiges: { icon: CircleDot, klasse: "text-muted-foreground" },
};

const EINHEIT: Record<Kategorie, { icon: LucideIcon; klasse: string; rand: string }> = {
  intervalle: { icon: Zap, klasse: "text-coral", rand: "bg-coral" },
  lauf: { icon: Footprints, klasse: "text-coral", rand: "bg-coral/60" },
  gym: { icon: Dumbbell, klasse: "text-primary", rand: "bg-primary" },
  ruhe: { icon: Moon, klasse: "text-muted-foreground", rand: "bg-border" },
  sonstiges: { icon: CircleDot, klasse: "text-muted-foreground", rand: "bg-border" },
};

const GROESSE = {
  sm: "size-6 [&_svg]:size-4",
  md: "size-8 [&_svg]:size-[18px]",
  lg: "size-9 [&_svg]:size-5",
} as const;

/** Glyphe einer Garmin-Aktivität */
export function SportIcon({
  typ,
  groesse = "md",
  className,
}: {
  typ: string;
  groesse?: keyof typeof GROESSE;
  className?: string;
}) {
  const { icon: Icon, klasse } = SPORT[sportart(typ)];
  return (
    <span className={cn("flex shrink-0 items-center justify-center", GROESSE[groesse], klasse, className)} aria-hidden>
      <Icon strokeWidth={1.8} />
    </span>
  );
}

/** Glyphe einer Plan-Einheit (nach Plan-Typ) */
export function EinheitIcon({
  typ,
  groesse = "md",
  className,
}: {
  typ: string;
  groesse?: keyof typeof GROESSE;
  className?: string;
}) {
  const { icon: Icon, klasse } = EINHEIT[kategorie(typ)];
  return (
    <span className={cn("flex shrink-0 items-center justify-center", GROESSE[groesse], klasse, className)} aria-hidden>
      <Icon strokeWidth={1.8} />
    </span>
  );
}

/** Farbe des linken Randstreifens einer Einheiten-Zeile */
export function einheitRand(typ: string): string {
  return EINHEIT[kategorie(typ)].rand;
}

export function einheitIconFuer(typ: string): LucideIcon {
  return EINHEIT[kategorie(typ)].icon;
}
