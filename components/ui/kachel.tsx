import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Ton = "lime" | "coral" | "blau" | "violett" | "neutral";

const TON_CHIP: Record<Ton, string> = {
  lime: "bg-primary/12 text-primary",
  coral: "bg-coral/14 text-coral",
  blau: "bg-chart-3/14 text-chart-3",
  violett: "bg-chart-4/14 text-chart-4",
  neutral: "bg-surface text-muted-foreground",
};

/** Kleines Icon im getönten Quadrat — Wiedererkennung der Kachel */
export function IconChip({
  icon: Icon,
  ton = "neutral",
  className,
}: {
  icon: LucideIcon;
  ton?: Ton;
  className?: string;
}) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[10px]", TON_CHIP[ton], className)}>
      <Icon className="size-4" strokeWidth={2.2} />
    </span>
  );
}

/**
 * Einheitlicher Kopf aller Karten: Icon-Chip, Kachel-Titel, optional
 * Untertitel und Aktion rechts. Ersetzt die frei formatierten CardTitles.
 */
export function KachelKopf({
  icon,
  titel,
  untertitel,
  aktion,
  ton = "neutral",
  className,
}: {
  icon?: LucideIcon;
  titel: React.ReactNode;
  untertitel?: React.ReactNode;
  aktion?: React.ReactNode;
  ton?: Ton;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-(--card-spacing)", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconChip icon={icon} ton={ton} />}
        <div className="min-w-0">
          <h2 className="kachel-titel truncate">{titel}</h2>
          {untertitel && <p className="mt-0.5 truncate text-[11px] text-dim-foreground">{untertitel}</p>}
        </div>
      </div>
      {aktion && <div className="shrink-0">{aktion}</div>}
    </div>
  );
}
