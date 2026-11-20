import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Ton = "lime" | "coral" | "blau" | "violett" | "neutral";

const TON_TEXT: Record<Ton, string> = {
  lime: "text-primary",
  coral: "text-coral",
  blau: "text-blau",
  violett: "text-chart-4",
  neutral: "text-muted-foreground",
};

/** Kleines Icon ohne Fläche — nur wo es der Orientierung dient */
export function IconChip({
  icon: Icon,
  ton = "neutral",
  className,
}: {
  icon: LucideIcon;
  ton?: Ton;
  className?: string;
}) {
  return <Icon className={cn("size-4 shrink-0", TON_TEXT[ton], className)} strokeWidth={1.8} aria-hidden />;
}

/**
 * Kopf einer Karte bzw. eines Abschnitts: Titel in Satzschreibung, optional
 * Untertitel und Aktion rechts. Bewusst ohne Icon — Struktur entsteht über
 * Typografie. (`icon`/`ton` bleiben für ältere Aufrufer erlaubt und werden
 * ignoriert.)
 */
export function KachelKopf({
  titel,
  untertitel,
  aktion,
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
    <div className={cn("flex items-start justify-between gap-3 px-(--card-spacing)", className)}>
      <div className="min-w-0">
        <h2 className="abschnitt-titel truncate">{titel}</h2>
        {untertitel && <p className="mt-0.5 truncate text-xs text-muted-foreground">{untertitel}</p>}
      </div>
      {aktion && <div className="shrink-0">{aktion}</div>}
    </div>
  );
}

/**
 * Flacher Abschnitt ohne Box: Titel mit optionaler Aktion, darunter der
 * Inhalt. Getrennt wird über Abstand und eine feine Linie oben.
 */
export function Abschnitt({
  titel,
  aktion,
  children,
  className,
  id,
  ohneLinie = false,
}: {
  titel: React.ReactNode;
  aktion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  ohneLinie?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-4", !ohneLinie && "border-t border-border pt-5", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="abschnitt-titel">{titel}</h2>
        {aktion}
      </div>
      {children}
    </section>
  );
}
