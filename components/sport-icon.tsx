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
 * Ein Icon- und Farbsystem für Aktivitäten (Garmin-Typen) und
 * Plan-Einheiten: Laufen = Coral, Kraft = Lime, Ruhe = neutral.
 */

const SPORT: Record<Sportart, { icon: LucideIcon; klasse: string }> = {
  lauf: { icon: Footprints, klasse: "bg-coral/14 text-coral" },
  trail: { icon: MountainSnow, klasse: "bg-coral/14 text-coral" },
  kraft: { icon: Dumbbell, klasse: "bg-primary/12 text-primary" },
  velo: { icon: Bike, klasse: "bg-chart-3/14 text-chart-3" },
  wandern: { icon: Mountain, klasse: "bg-chart-4/14 text-chart-4" },
  schwimmen: { icon: Waves, klasse: "bg-chart-3/14 text-chart-3" },
  sonstiges: { icon: CircleDot, klasse: "bg-surface text-muted-foreground" },
};

const EINHEIT: Record<Kategorie, { icon: LucideIcon; klasse: string; rand: string }> = {
  intervalle: { icon: Zap, klasse: "bg-coral/14 text-coral", rand: "bg-coral" },
  lauf: { icon: Footprints, klasse: "bg-coral/14 text-coral", rand: "bg-coral/70" },
  gym: { icon: Dumbbell, klasse: "bg-primary/12 text-primary", rand: "bg-primary" },
  ruhe: { icon: Moon, klasse: "bg-surface text-muted-foreground", rand: "bg-surface-2" },
  sonstiges: { icon: CircleDot, klasse: "bg-surface text-muted-foreground", rand: "bg-surface-2" },
};

const GROESSE = {
  sm: "size-8 rounded-[10px] [&_svg]:size-4",
  md: "size-10 rounded-xl [&_svg]:size-[18px]",
  lg: "size-12 rounded-[14px] [&_svg]:size-[22px]",
} as const;

/** Icon einer Garmin-Aktivität im getönten Quadrat */
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
      <Icon strokeWidth={2.1} />
    </span>
  );
}

/** Icon einer Plan-Einheit (nach Plan-Typ) im getönten Quadrat */
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
      <Icon strokeWidth={2.1} />
    </span>
  );
}

/** Farbe des linken Randstreifens einer Einheiten-Karte */
export function einheitRand(typ: string): string {
  return EINHEIT[kategorie(typ)].rand;
}

export function einheitIconFuer(typ: string): LucideIcon {
  return EINHEIT[kategorie(typ)].icon;
}
