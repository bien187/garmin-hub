/** Mini-Verlauf der Schlafdauer (letzte Nächte), Lücken bleiben leer */
export function TrendBalken({
  trend,
  className,
}: {
  trend: { datum: string; dauerS: number | null; garminScore: number | null }[];
  className?: string;
}) {
  if (trend.length < 2) return null;
  const max = Math.max(9 * 3600, ...trend.map((t) => t.dauerS ?? 0));
  const B = 100;
  const H = 28;
  const w = B / trend.length;
  const y7h = H - (7 * 3600 * H) / max;
  return (
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className={className} role="img" aria-label="Schlafdauer der letzten Nächte">
      <line x1={0} x2={B} y1={y7h} y2={y7h} stroke="var(--dim-foreground)" strokeWidth={0.4} strokeDasharray="1.5 1.5" />
      {trend.map((t, i) => {
        if (t.dauerS == null) return null;
        const h = (t.dauerS * H) / max;
        const letzte = i === trend.length - 1;
        return (
          <rect
            key={t.datum}
            x={i * w + w * 0.15}
            y={H - h}
            width={w * 0.7}
            height={h}
            rx={0.6}
            fill={letzte ? "var(--primary)" : "var(--schlaf-leicht)"}
            opacity={letzte ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}
