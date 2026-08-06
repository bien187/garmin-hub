"use client";

import { useEffect, useRef, useState } from "react";

/** Zählt beim ERSTEN Mount 0→value (§6 Nr. 2). reduced-motion: sofort. */
function useCountUp(value: number, durationMs = 420): number {
  const [n, setN] = useState(value);
  const gestartet = useRef(false);
  useEffect(() => {
    if (gestartet.current) {
      setN(value);
      return;
    }
    gestartet.current = true;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - start) / durationMs);
      // ease-out
      setN(Math.round(value * (1 - Math.pow(1 - f, 3))));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return n;
}

export function CountdownHero({
  wochen,
  tage,
  vorbei,
  phaseNr,
  phaseName,
  epDatumLang,
}: {
  wochen: number;
  tage: number;
  vorbei: boolean;
  phaseNr: number;
  phaseName: string;
  epDatumLang: string;
}) {
  const w = useCountUp(wochen);
  const t = useCountUp(tage);

  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-dim-foreground">
        Eignungsprüfung Grenadier
      </div>
      {vorbei ? (
        <div className="stat-display text-[34px] leading-none">EP absolviert</div>
      ) : (
        <div className="stat-display text-[34px] leading-none tabular-nums">
          {w}
          <span className="text-lg font-normal text-dim-foreground"> Wo </span>
          {t}
          <span className="text-lg font-normal text-dim-foreground"> Tage</span>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
          Phase {phaseNr}: {phaseName}
        </span>
        <span className="text-[13px] text-muted-foreground">bis {epDatumLang}</span>
      </div>
    </div>
  );
}
