"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 60-bpm-Metronom (Web Audio API) mit Sekunden-Timer — für die
 * Rumpfdisziplinen im Sekundentakt. Präzises Scheduling über AudioContext-
 * Lookahead statt setInterval-Drift.
 */
export function Metronome({
  zielSekunden,
  onStop,
  klasse,
}: {
  zielSekunden?: number;
  onStop?: (sekunden: number) => void;
  klasse?: string;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [sekunden, setSekunden] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const naechsterTickRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startZeitRef = useRef(0);

  const tick = useCallback((zeit: number, betont: boolean) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = betont ? 1320 : 880;
    gain.gain.setValueAtTime(0.001, zeit);
    gain.gain.exponentialRampToValueAtTime(0.4, zeit + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, zeit + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(zeit);
    osc.stop(zeit + 0.08);
  }, []);

  const stop = useCallback(() => {
    setLaeuft(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const gestoppt = Math.round((performance.now() - startZeitRef.current) / 1000);
    if (startZeitRef.current > 0) onStop?.(gestoppt);
    startZeitRef.current = 0;
  }, [onStop]);

  const start = useCallback(() => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current;
    ctx.resume();
    setSekunden(0);
    setLaeuft(true);
    startZeitRef.current = performance.now();
    naechsterTickRef.current = ctx.currentTime + 0.1;

    timerRef.current = setInterval(() => {
      // Lookahead-Scheduling: alle fälligen Ticks der nächsten 250 ms planen
      while (naechsterTickRef.current < ctx.currentTime + 0.25) {
        const n = Math.round(naechsterTickRef.current);
        tick(naechsterTickRef.current, n % 10 === 0);
        naechsterTickRef.current += 1; // 60 bpm = 1 Tick/s
      }
      setSekunden(Math.floor((performance.now() - startZeitRef.current) / 1000));
    }, 100);
  }, [tick]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  /* Auto-Stopp beim Ziel */
  useEffect(() => {
    if (laeuft && zielSekunden && sekunden >= zielSekunden) stop();
  }, [laeuft, sekunden, zielSekunden, stop]);

  return (
    <div className={cn("flex items-center gap-3", klasse)}>
      <Button
        size="sm"
        variant={laeuft ? "destructive" : "default"}
        onClick={laeuft ? stop : start}
        className="min-w-[110px]"
      >
        {laeuft ? <Pause className="size-4" /> : <Play className="size-4" />}
        {laeuft ? "Stopp" : "Metronom 60"}
      </Button>
      <span
        className={cn(
          "stat-display text-3xl tabular-nums",
          zielSekunden && sekunden >= zielSekunden && "text-status-green"
        )}
      >
        {sekunden}s
      </span>
      {zielSekunden ? (
        <span className="text-xs text-muted-foreground">Ziel {zielSekunden}s</span>
      ) : null}
      {sekunden > 0 && !laeuft && (
        <Button size="sm" variant="ghost" onClick={() => setSekunden(0)}>
          <TimerReset className="size-4" />
        </Button>
      )}
    </div>
  );
}
