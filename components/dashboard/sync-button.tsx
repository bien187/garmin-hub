"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type SyncPhase = "idle" | "activities" | "health" | "finalize" | "fehler";

/**
 * „Jetzt synchronisieren": ruft die Chunk-API in einer Schleife auf,
 * bis hasMore=false, dann finalize (Engine-Neuberechnung).
 * Zusätzlich Pull-to-Refresh auf Mobile (Overscroll am Seitenanfang).
 */
export function SyncButton({ kompakt = false }: { kompakt?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [chunks, setChunks] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const laeuft = phase !== "idle" && phase !== "fehler";
  const laeuftRef = useRef(false);

  const sync = useCallback(async () => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    setChunks(0);
    try {
      for (const typ of ["activities", "health"] as const) {
        setPhase(typ);
        let hasMore = true;
        let schutz = 0;
        while (hasMore && schutz < 200) {
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ typ }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(
              data.code === "mfa_required"
                ? "Garmin verlangt einen MFA-Code — unter Einstellungen eingeben."
                : (data.error ?? "Sync fehlgeschlagen")
            );
          }
          hasMore = Boolean(data.hasMore);
          schutz++;
          setChunks((c) => c + 1);
        }
      }
      setPhase("finalize");
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typ: "finalize" }),
      });
      setPhase("idle");
      router.refresh();
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

  const label =
    phase === "activities"
      ? `Aktivitäten… (${chunks})`
      : phase === "health"
        ? `Gesundheit… (${chunks})`
        : phase === "finalize"
          ? "Berechne…"
          : "Sync";

  return (
    <div className={cn("flex flex-col gap-1", kompakt ? "items-end" : "items-stretch")}>
      <Button
        variant={phase === "fehler" ? "destructive" : "secondary"}
        size={kompakt ? "sm" : "default"}
        onClick={sync}
        disabled={laeuft}
        className="min-h-10"
      >
        <RefreshCw className={cn("size-4", laeuft && "animate-spin")} />
        {label}
      </Button>
      {laeuft && chunks > 0 && (
        <Progress value={Math.min(95, chunks * 4)} className="h-1" />
      )}
      {fehler && <p className="max-w-56 text-right text-xs text-status-red">{fehler}</p>}
    </div>
  );
}
