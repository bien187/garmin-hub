"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SyncPhase =
  | "idle"
  | "zonen"
  | "activities"
  | "health"
  | "schlaf"
  | "finalize"
  | "fehler";

/**
 * „Jetzt synchronisieren": ruft die Chunk-API in einer Schleife auf,
 * bis hasMore=false, dann finalize (Engine-Neuberechnung).
 * Nach „health" läuft der Schlaf-Backfill („schlaf") mit Fortschritt x/y;
 * ist er einmal durch, antwortet die Bridge sofort mit hasMore=false.
 * Zusätzlich Pull-to-Refresh auf Mobile (Overscroll am Seitenanfang).
 */
export function SyncButton({ kompakt = false }: { kompakt?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [chunks, setChunks] = useState(0);
  const [schlaf, setSchlaf] = useState<{ erledigt: number; gesamt: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laeuft = phase !== "idle" && phase !== "fehler";
  const laeuftRef = useRef(false);

  const sync = useCallback(async () => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    setChunks(0);
    setSchlaf(null);
    let schlafFehler: string | null = null;
    try {
      for (const typ of ["zonen", "activities", "health", "schlaf"] as const) {
        setPhase(typ);
        let hasMore = true;
        let schutz = 0;
        while (hasMore && schutz < 200) {
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ typ }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const meldung =
              data.code === "mfa_required"
                ? "Garmin verlangt einen MFA-Code — unter Einstellungen eingeben."
                : (data.error ?? "Sync fehlgeschlagen");
            // Schlaf-Backfill blockiert die Berechnung nicht; Rest beim nächsten Sync
            if (typ === "schlaf" && data.code !== "mfa_required") {
              schlafFehler = `Schlaf-Historie: ${meldung}`;
              break;
            }
            throw new Error(meldung);
          }
          if (typ === "schlaf" && data.fortschritt) {
            setSchlaf({
              erledigt: Number(data.fortschritt.erledigt) || 0,
              gesamt: Number(data.fortschritt.gesamt) || 0,
            });
          }
          hasMore = Boolean(data.hasMore);
          schutz++;
          setChunks((c) => c + 1);
        }
      }
      setPhase("finalize");
      const finalisiert = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typ: "finalize" }),
      });
      if (!finalisiert.ok) throw new Error('Berechnung fehlgeschlagen. Bitte erneut synchronisieren.');
      router.refresh();
      if (schlafFehler) {
        setFehler(schlafFehler);
        setPhase("fehler");
      } else {
        setPhase("idle");
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler");
      setPhase("fehler");
    } finally {
      laeuftRef.current = false;
    }
  }, [router]);

  /* Pull-to-Refresh (nur Mobile, am Anfang des internen Scroll-Containers) */
  useEffect(() => {
    const scroller = document.getElementById("app-scroll");
    if (!scroller) return;
    let startY = 0;
    let gezogen = false;
    const obenAm = () => scroller.scrollTop <= 0;
    const onStart = (e: TouchEvent) => {
      if (obenAm()) {
        startY = e.touches[0].clientY;
        gezogen = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (gezogen && e.touches[0].clientY - startY > 130 && obenAm()) {
        gezogen = false;
        sync();
      }
    };
    const onEnd = () => {
      gezogen = false;
    };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: true });
    scroller.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
    };
  }, [sync]);

  // Ehrlicher Chunk-Zähler (KEINE erfundene Prozent-Progressbar)
  const zaehler =
    phase === "zonen"
      ? "HF-Zonen"
      : phase === "activities"
        ? `Läufe ${chunks}`
        : phase === "health"
          ? `Gesundheit ${chunks}`
          : phase === "schlaf"
            ? schlaf && schlaf.gesamt > 0
              ? `Schlaf-Historie ${schlaf.erledigt}/${schlaf.gesamt}`
              : "Schlaf-Historie"
            : phase === "finalize"
              ? "Berechne"
              : null;

  if (kompakt) {
    // Dashboard: reiner Icon-Button (44×44), Zähler nur während des Syncs
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={sync}
          disabled={laeuft}
          aria-label="Synchronisieren"
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-lg bg-muted px-2.5",
            phase === "fehler" && "text-status-red"
          )}
        >
          <RefreshCw className={cn("size-4.25", laeuft && "gh-spin")} />
          {zaehler && (
            <span className="stat-mono text-xs tabular-nums">{zaehler}</span>
          )}
        </button>
        {fehler && <p className="max-w-56 text-right text-xs text-status-red">{fehler}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <Button
        variant={phase === "fehler" ? "destructive" : "secondary"}
        onClick={sync}
        disabled={laeuft}
        className="min-h-11"
      >
        <RefreshCw className={cn("size-4", laeuft && "gh-spin")} />
        {zaehler ?? "Synchronisieren"}
      </Button>
      {fehler && <p className="max-w-56 text-right text-xs text-status-red">{fehler}</p>}
    </div>
  );
}
