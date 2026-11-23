"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GraphDaten, ProcessedTrack } from "@/lib/engine/flyover";
import { sampleAt, SampleCursor } from "@/lib/engine/flyover";
import { formatDauer, formatPace } from "@/lib/format";
import { DIAGRAMM_FARBEN, DIAGRAMM_FARBEN_HEX, Legende } from "@/components/ui/diagramm";

/**
 * Kombinierter Verlaufsgraph (Höhe + Speed + HF) als Doppel-Canvas:
 * statische Ebene einmal, Overlay (Indikator, helle Kurven links des
 * Indikators, Labels) pro Frame. X-Achse ist ZEITbasiert — der Indikator
 * läuft dadurch linear zum Video-Fortschritt.
 */

interface FlyoverGraphProps {
  track: ProcessedTrack;
  daten: GraphDaten;
  /** aktuelle Videozeit 0..dauer, mutabel für 60-fps-Reads ohne React */
  tVideoRef: React.MutableRefObject<number>;
  videoDauerS: number;
  onScrub: (tVideo: number) => void;
  heightPx?: number;
}

/* Farben wie in allen Diagrammen: Höhe neutral, Pace Orange, Puls Rot (components/ui/diagramm) */
const FARBE_ELE = "rgba(154,165,179,0.28)";
const FARBE_ELE_GEDIMMT = "rgba(154,165,179,0.14)";
const FARBE_SPEED = DIAGRAMM_FARBEN_HEX.pace;
const FARBE_SPEED_GEDIMMT = "rgba(214,154,114,0.4)";
const FARBE_HR = DIAGRAMM_FARBEN_HEX.puls;
const FARBE_HR_GEDIMMT = "rgba(210,122,114,0.4)";
const FARBE_ACHSE = "#6e7a89";

/** Schrift der App (Geist) auch im Canvas */
const schrift = (el: Element | null, px: number) =>
  `${px}px ${el ? getComputedStyle(el).fontFamily : "system-ui, sans-serif"}`;

export function FlyoverGraph({
  track,
  daten,
  tVideoRef,
  videoDauerS,
  onScrub,
  heightPx = 110,
}: FlyoverGraphProps) {
  const statischRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const cursorRef = useRef(new SampleCursor());
  const ziehtRef = useRef(false);
  /** Zuletzt gezeichneter Stand — unverändert heisst: Frame auslassen */
  const gezeichnetRef = useRef<{ t: number; b: number } | null>(null);

  const xVonZeit = useCallback(
    (t: number, breite: number) => (t / track.totalDuration) * breite,
    [track.totalDuration]
  );

  const yEle = useCallback(
    (e: number, hoehe: number) => {
      const spanne = Math.max(1, daten.eleMax - daten.eleMin);
      const pad = spanne * 0.05;
      return hoehe - ((e - daten.eleMin + pad) / (spanne + 2 * pad)) * hoehe;
    },
    [daten]
  );
  const ySpeed = useCallback(
    (v: number, hoehe: number) => hoehe - (Math.min(v, daten.speedMax) / daten.speedMax) * hoehe * 0.92,
    [daten]
  );
  const yHr = useCallback(
    (h: number, hoehe: number) => {
      const spanne = Math.max(1, daten.hrMax - daten.hrMin);
      return hoehe - ((h - daten.hrMin) / spanne) * hoehe * 0.92;
    },
    [daten]
  );

  /** Kurven in einen Kontext zeichnen (für statisch-gedimmt und hell-geclippt) */
  const zeichneKurven = useCallback(
    (ctx: CanvasRenderingContext2D, b: number, h: number, hell: boolean) => {
      // Höhe: gefüllte Fläche, hinterste Ebene
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < daten.zeit.length; i++) {
        ctx.lineTo(xVonZeit(daten.zeit[i], b), yEle(daten.ele[i], h));
      }
      ctx.lineTo(b, h);
      ctx.closePath();
      ctx.fillStyle = hell ? FARBE_ELE : FARBE_ELE_GEDIMMT;
      ctx.fill();

      // Speed-Linie
      ctx.beginPath();
      for (let i = 0; i < daten.zeit.length; i++) {
        const x = xVonZeit(daten.zeit[i], b);
        const y = ySpeed(daten.speed[i], h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hell ? FARBE_SPEED : FARBE_SPEED_GEDIMMT;
      ctx.lineWidth = 2;
      ctx.stroke();

      // HF-Linie (Lücken > 30 s nicht überbrücken)
      if (daten.hatHr) {
        ctx.beginPath();
        let offen = false;
        for (let i = 0; i < daten.zeit.length; i++) {
          const hr = daten.hr[i];
          if (hr == null) {
            offen = false;
            continue;
          }
          const x = xVonZeit(daten.zeit[i], b);
          const y = yHr(hr, h);
          if (!offen) {
            ctx.moveTo(x, y);
            offen = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = hell ? FARBE_HR : FARBE_HR_GEDIMMT;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },
    [daten, xVonZeit, yEle, ySpeed, yHr]
  );

  /* Statische Ebene: gedimmte Kurven + Achsen-Ticks */
  const zeichneStatisch = useCallback(() => {
    const canvas = statischRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = window.devicePixelRatio || 1;
    const b = wrapper.clientWidth;
    const h = heightPx;
    canvas.width = b * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${b}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, b, h);
    gezeichnetRef.current = null; // Overlay mit neuer Breite nachziehen

    // Graph liegt in einer dunklen Card → kein eigener Hintergrund nötig.
    // Noch nicht durchlaufener Teil bewusst gedimmt (Kontext), der
    // durchlaufene Teil wird vom Overlay hell überzeichnet.
    zeichneKurven(ctx, b, h, false);

    // Zeit-Ticks (Realzeit) — klein und gedämpft wie die Achsen der anderen Diagramme
    ctx.fillStyle = FARBE_ACHSE;
    ctx.font = schrift(wrapper, 10);
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const t = (track.totalDuration * i) / ticks;
      const x = Math.min(b - 26, Math.max(2, xVonZeit(t, b) - 12));
      ctx.fillText(formatDauer(t), x, h - 3);
    }

  }, [heightPx, track.totalDuration, xVonZeit, zeichneKurven]);

  /* Overlay: helle Kurven bis zum Indikator (Clip), Linie, Punkte, Labels */
  const zeichneOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    rafRef.current = requestAnimationFrame(zeichneOverlay);
    const dpr = window.devicePixelRatio || 1;
    const b = wrapper.clientWidth;
    const h = heightPx;
    // Nur neu zeichnen, wenn sich Videozeit oder Breite geändert haben —
    // sonst liefe das komplette Neuzeichnen aller Kurven 60× pro Sekunde
    // auch im Stillstand und nähme der Karte auf dem Handy Rechenzeit weg
    const letzte = gezeichnetRef.current;
    if (letzte && letzte.t === tVideoRef.current && letzte.b === b) return;
    gezeichnetRef.current = { t: tVideoRef.current, b };
    if (canvas.width !== b * dpr) {
      canvas.width = b * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${b}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, b, h);

    const progress = Math.min(1, Math.max(0, tVideoRef.current / videoDauerS));
    const x = progress * b;
    const tReal = progress * track.totalDuration;
    const st = sampleAt(track, tReal, cursorRef.current);

    // durchlaufener Teil hell (Clip-Rechteck)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, x, h);
    ctx.clip();
    zeichneKurven(ctx, b, h, true);
    ctx.restore();

    // Indikatorlinie
    ctx.strokeStyle = "rgba(240,242,244,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // Punkte je Reihe
    const punkt = (y: number, farbe: string) => {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = farbe;
      ctx.fill();
      ctx.strokeStyle = "#151b26";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    punkt(yEle(st.ele, h), DIAGRAMM_FARBEN_HEX.hoehe);
    punkt(ySpeed(st.speed, h), FARBE_SPEED);
    if (st.hr != null) punkt(yHr(st.hr, h), FARBE_HR);

    // Wertelabels kompakt oben
    const pace = st.speed > 0.3 ? formatPace(1000 / st.speed) : "–";
    const label = `${Math.round(st.ele)} m · ${st.hr != null ? `${Math.round(st.hr)} bpm · ` : ""}${pace}`;
    ctx.font = schrift(wrapper, 11);
    const tb = ctx.measureText(label).width;
    const lx = Math.min(b - tb - 8, Math.max(4, x + 6));
    // Wert-Etikett im Stil der Tooltips (Fläche --popover, feiner Rand)
    ctx.fillStyle = "rgba(35,46,60,0.95)";
    ctx.strokeStyle = "#303a47";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx - 5, 1, tb + 10, 18, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = DIAGRAMM_FARBEN_HEX.textHell;
    ctx.fillText(label, lx, 14);
  }, [heightPx, track, daten, videoDauerS, tVideoRef, xVonZeit, yEle, ySpeed, yHr, zeichneKurven]);

  useEffect(() => {
    zeichneStatisch();
    rafRef.current = requestAnimationFrame(zeichneOverlay);
    const onResize = () => zeichneStatisch();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [zeichneStatisch, zeichneOverlay]);

  /* Scrubbing: Tap/Drag setzt die Videozeit */
  const scrubAus = useCallback(
    (clientX: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onScrub(f * videoDauerS);
    },
    [onScrub, videoDauerS]
  );

  return (
    <div className="space-y-2">
    <div
      ref={wrapperRef}
      className="relative w-full cursor-crosshair touch-none select-none"
      style={{ height: heightPx }}
      onPointerDown={(e) => {
        ziehtRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        scrubAus(e.clientX);
      }}
      onPointerMove={(e) => {
        if (ziehtRef.current) scrubAus(e.clientX);
      }}
      onPointerUp={() => {
        ziehtRef.current = false;
      }}
    >
      <canvas ref={statischRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="absolute inset-0" />
    </div>
    <Legende
      eintraege={[
        { art: "flaeche", farbe: DIAGRAMM_FARBEN.hoehe, label: `Höhe ${Math.round(daten.eleMin)}–${Math.round(daten.eleMax)} m` },
        { art: "linie", farbe: DIAGRAMM_FARBEN.pace, label: "Pace" },
        ...(daten.hatHr ? [{ art: "linie" as const, farbe: DIAGRAMM_FARBEN.puls, label: "Puls" }] : []),
      ]}
    />
    </div>
  );
}
