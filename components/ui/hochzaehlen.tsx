"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zahl, die beim ersten Erscheinen von 0 hochzählt (ease-out, ~0.6 s).
 * Bei reduced-motion sofort der Endwert. Server-Render = Endwert.
 */
export function Hochzaehlen({
  wert,
  dezimalen = 0,
  dauerMs = 650,
}: {
  wert: number;
  dezimalen?: number;
  dauerMs?: number;
}) {
  const [n, setN] = useState(wert);
  const gestartet = useRef(false);
  useEffect(() => {
    if (gestartet.current) {
      setN(wert);
      return;
    }
    gestartet.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - start) / dauerMs);
      setN(wert * (1 - Math.pow(1 - f, 3)));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wert, dauerMs]);
  return <>{n.toLocaleString("de-CH", { minimumFractionDigits: dezimalen, maximumFractionDigits: dezimalen })}</>;
}
