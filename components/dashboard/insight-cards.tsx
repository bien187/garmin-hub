"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
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
    return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
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
    <div className="space-y-3">
      {tipps.map((t, i) => (
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm"
        >
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
          {t}
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        {karten.map((k) => (
          <Card key={k.id} className="py-4">
            <CardContent className="space-y-2 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium leading-tight">{k.titel}</div>
                <span className="stat-mono shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                  r = {k.r.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{k.text}</p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="x" type="number" hide domain={["dataMin", "dataMax"]} />
                    <YAxis dataKey="y" type="number" hide domain={["dataMin", "dataMax"]} />
                    <Scatter data={k.punkte} fill="var(--muted-foreground)" opacity={0.5} />
                    {/* Trend: Linie ohne eigene Punktsymbole */}
                    <Scatter
                      data={ausgleichsgerade(k.punkte)}
                      line={{ stroke: "var(--primary)", strokeWidth: 2 }}
                      shape={() => <g />}
                      legendType="none"
                      isAnimationActive={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {k.xLabel} ↔ {k.yLabel} · n = {k.n} · Korrelation ≠ Kausalität
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
