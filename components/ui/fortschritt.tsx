import { cn } from "@/lib/utils";

/**
 * Fortschrittsring (SVG). `wert`/`max` werden auf 0–1 geklemmt; die
 * Füllung animiert per CSS-Transition. Ohne Ziel (max ≤ 0) bleibt er leer.
 */
export function Ring({
  wert,
  max,
  groesse = 56,
  dicke = 4,
  ton = "lime",
  children,
  className,
  label,
}: {
  wert: number;
  max: number;
  groesse?: number;
  dicke?: number;
  ton?: "lime" | "coral" | "blau";
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
        <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={dicke} />
        <circle
          cx={groesse / 2}
          cy={groesse / 2}
          r={r}
          fill="none"
          stroke={ton === "lime" ? "var(--primary)" : ton === "blau" ? "var(--blau)" : "var(--coral)"}
          strokeWidth={dicke}
          strokeLinecap="round"
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - anteil)}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

/** Schmaler Fortschrittsbalken (0–max), ohne Animation */
export function Balken({
  wert,
  max,
  ton = "lime",
  className,
}: {
  wert: number;
  max: number;
  ton?: "lime" | "coral" | "blau";
  className?: string;
}) {
  const anteil = max > 0 ? Math.max(0, Math.min(1, wert / max)) : 0;
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-border", className)}>
      <div
        className={cn("h-full rounded-full", ton === "lime" ? "bg-primary" : ton === "blau" ? "bg-blau" : "bg-coral")}
        style={{ width: `${anteil * 100}%` }}
      />
    </div>
  );
}
