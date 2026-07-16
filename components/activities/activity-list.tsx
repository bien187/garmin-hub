"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dumbbell, Footprints, Timer } from "lucide-react";
import { PolylineSvg } from "./polyline-svg";
import { formatDauer, formatKm, formatPace, formatZeit } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ListenAktivitaet {
  id: number;
  typ: string;
  name: string | null;
  startZeit: string;
  dauerS: number;
  distanzM: number | null;
  hmAuf: number | null;
  avgHr: number | null;
  avgPace: number | null;
  polyline: string | null;
}

const FILTER = [
  { id: "alle", label: "Alle" },
  { id: "running", label: "Läufe" },
  { id: "strength", label: "Kraft" },
] as const;

const ZEITRAUM = [
  { id: "", label: "Gesamt" },
  { id: "30", label: "30 Tage" },
  { id: "90", label: "90 Tage" },
] as const;

export function ActivityList() {
  const [aktivitaeten, setAktivitaeten] = useState<ListenAktivitaet[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [typ, setTyp] = useState<string>("alle");
  const [zeitraum, setZeitraum] = useState<string>("");
  const sentinel = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ laedt: false, fertig: false, cursor: null as string | null });
  stateRef.current = { laedt, fertig, cursor };

  const lade = useCallback(
    async (reset: boolean) => {
      if (stateRef.current.laedt) return;
      if (!reset && stateRef.current.fertig) return;
      setLaedt(true);
      const p = new URLSearchParams();
      const cur = reset ? null : stateRef.current.cursor;
      if (cur) p.set("cursor", cur);
      if (typ !== "alle") p.set("typ", typ);
      if (zeitraum) {
        const von = new Date(Date.now() - Number(zeitraum) * 86_400_000);
        p.set("von", von.toISOString());
      }
      try {
        const res = await fetch(`/api/activities?${p}`);
        const data = await res.json();
        const neue: ListenAktivitaet[] = data.aktivitaeten ?? [];
        setAktivitaeten((alt) => (reset ? neue : [...alt, ...neue]));
        setCursor(data.nextCursor);
        setFertig(!data.nextCursor);
      } finally {
        setLaedt(false);
      }
    },
    [typ, zeitraum]
  );

  useEffect(() => {
    setAktivitaeten([]);
    setCursor(null);
    setFertig(false);
    lade(true);
  }, [lade]);

  /* Infinite Scroll */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) lade(false);
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lade]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-muted p-0.5">
          {FILTER.map((f) => (
            <button
              key={f.id}
              onClick={() => setTyp(f.id)}
              className={cn(
                "min-h-[36px] rounded-md px-3 text-sm transition-colors",
                typ === f.id ? "bg-background font-medium" : "text-muted-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-muted p-0.5">
          {ZEITRAUM.map((z) => (
            <button
              key={z.id}
              onClick={() => setZeitraum(z.id)}
              className={cn(
                "min-h-[36px] rounded-md px-3 text-sm transition-colors",
                zeitraum === z.id ? "bg-background font-medium" : "text-muted-foreground"
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5">
        {aktivitaeten.map((a) => {
          const datum = new Date(a.startZeit);
          const istKraftTyp = a.typ.includes("strength") || a.typ.includes("fitness");
          return (
            <Link
              key={a.id}
              href={`/activities/${a.id}`}
              className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <PolylineSvg encoded={a.polyline} className="size-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {istKraftTyp ? (
                    <Dumbbell className="size-3.5" />
                  ) : (
                    <Footprints className="size-3.5" />
                  )}
                  {datum.toLocaleDateString("de-CH", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formatZeit(datum)}
                </div>
                <div className="mt-0.5 truncate font-medium">{a.name ?? a.typ}</div>
                <div className="stat-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Timer className="size-3" />
                    {formatDauer(a.dauerS)}
                  </span>
                  {a.distanzM != null && a.distanzM > 100 && <span>{formatKm(a.distanzM)}</span>}
                  {a.avgPace != null && !istKraftTyp && <span>{formatPace(a.avgPace)}</span>}
                  {a.hmAuf != null && a.hmAuf > 20 && <span>{Math.round(a.hmAuf)} Hm</span>}
                  {a.avgHr != null && <span>{Math.round(a.avgHr)} bpm</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {laedt && (
        <div className="grid gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      )}
      {!laedt && aktivitaeten.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Keine Aktivitäten gefunden. Zuerst auf dem Dashboard synchronisieren.
        </p>
      )}
      <div ref={sentinel} />
    </div>
  );
}
