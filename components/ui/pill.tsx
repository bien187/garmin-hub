import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PillTon = "lime" | "coral" | "neutral" | "gruen" | "gelb" | "orange" | "rot" | "solid";

const TON: Record<PillTon, string> = {
  lime: "bg-primary/10 text-primary",
  coral: "bg-coral/10 text-coral",
  neutral: "bg-surface text-muted-foreground",
  gruen: "bg-status-green/10 text-status-green",
  gelb: "bg-status-yellow/10 text-status-yellow",
  orange: "bg-status-orange/10 text-status-orange",
  rot: "bg-status-red/10 text-status-red",
  solid: "bg-primary text-primary-foreground",
};

/** Kleines Etikett für Status — sparsam einsetzen */
export function Pill({
  ton = "neutral",
  icon: Icon,
  children,
  className,
}: {
  ton?: PillTon;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1 rounded-sm px-1.5 text-[11px] font-medium whitespace-nowrap",
        TON[ton],
        className
      )}
    >
      {Icon && <Icon className="size-3 shrink-0" strokeWidth={2} />}
      <span className="truncate">{children}</span>
    </span>
  );
}
