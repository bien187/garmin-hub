import { cn } from "@/lib/utils";

/**
 * Fortschrittsring (SVG). `wert`/`max` werden auf 0–1 geklemmt; die
 * Füllung animiert per CSS-Transition. Ohne Ziel (max ≤ 0) bleibt er leer.
 */
export function Ring({
  wert,
  max,
  groesse = 56,
  dicke = 6,
  ton = "lime",
  children,
  className,
  label,
}: {
  wert: number;
  max: number;
  groesse?: number;
  dicke?: number;
  ton?: "lime" | "coral";
  children?: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const r = (groesse - dicke) / 2;
  const umfang = 2 * Math.PI * r;
  const anteil = max > 0 ? Math.max(0, Math.min(1, wert / max)) : 0;
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: groesse, height: groesse }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg width={groesse} height={groesse} className="-rotate-90">
        <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={dicke} />
        <circle
          cx={groesse / 2}
          cy={groesse / 2}
          r={r}
          fill="none"
          stroke={ton === "lime" ? "var(--primary)" : "var(--coral)"}
          strokeWidth={dicke}
          strokeLinecap="round"
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - anteil)}
          style={{ transition: "stroke-dashoffset var(--dur-emphasis) var(--ease-base)" }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

/** Schmaler Fortschrittsbalken, wächst beim Erscheinen von links */
export function Balken({
  wert,
  max,
  ton = "lime",
  className,
}: {
  wert: number;
  max: number;
  ton?: "lime" | "coral";
  className?: string;
}) {
  const anteil = max > 0 ? Math.max(0, Math.min(1, wert / max)) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className={cn("gh-wachsen h-full rounded-full", ton === "lime" ? "flaeche-lime" : "flaeche-coral")}
        style={{ width: `${anteil * 100}%` }}
      />
    </div>
  );
}
