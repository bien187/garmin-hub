"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { ausgleichsgerade, type InsightKarte } from "@/lib/engine/correlations";

/** Korrelations-Insights (§6.6) — was Garmin nicht zeigt */
export function InsightCards() {
  const [karten, setKarten] = useState<InsightKarte[] | null>(null);
  const [tipps, setTipps] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => (r.ok ? r.json() : { karten: [], tipps: [] }))
      .then((d) => {
        setKarten(d.karten ?? []);
        setTipps(d.tipps ?? []);
      })
      .catch(() => setKarten([]));
  }, []);

  if (karten === null) {
    return <div className="h-24 animate-pulse rounded-md bg-surface" />;
  }
  if (karten.length === 0 && tipps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch zu wenig Daten für Korrelations-Insights (mind. 15 Tage mit
        Messwerten nötig).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {tipps.map((t, i) => (
        <p key={i} className="border-l-2 border-primary/60 pl-3 text-sm leading-snug text-foreground/90">
          {t}
        </p>
      ))}
      <ul className="divide-y divide-border border-y border-border">
        {karten.map((k) => (
          <li key={k.id} className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_180px] sm:items-center">
            <div className="min-w-0 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium leading-tight">{k.titel}</span>
                <span className="stat-mono shrink-0 text-xs text-muted-foreground">r = {k.r.toFixed(2)}</span>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">{k.text}</p>
              <p className="text-[11px] text-dim-foreground">
                {k.xLabel} ↔ {k.yLabel} · n = {k.n} · Korrelation ≠ Kausalität
              </p>
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="x" type="number" hide domain={["dataMin", "dataMax"]} />
                  <YAxis dataKey="y" type="number" hide domain={["dataMin", "dataMax"]} />
                  <Scatter data={k.punkte} fill="var(--muted-foreground)" opacity={0.45} isAnimationActive={false} />
                  {/* Trend: Linie ohne eigene Punktsymbole */}
                  <Scatter
                    data={ausgleichsgerade(k.punkte)}
                    line={{ stroke: "var(--primary)", strokeWidth: 1.5 }}
                    shape={() => <g />}
                    legendType="none"
                    isAnimationActive={false}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
