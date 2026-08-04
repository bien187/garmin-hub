"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dumbbell, Footprints, RefreshCw } from "lucide-react";
import { SwipeRow } from "./swipe-row";
import { useActivityDelete } from "./use-activity-delete";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addTage,
  formatDatum,
  formatDauer,
  formatKm,
  formatPace,
  formatZeit,
  isoDatum,
  montagVon,
} from "@/lib/format";
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

/** Aktivitäten nach Kalenderwoche gruppieren (Montag als Schlüssel) */
function nachWoche(aktivitaeten: ListenAktivitaet[]) {
  const map = new Map<string, ListenAktivitaet[]>();
  for (const a of aktivitaeten) {
    const mo = montagVon(isoDatum(new Date(a.startZeit)));
    (map.get(mo) ?? map.set(mo, []).get(mo)!).push(a);
  }
  return [...map.entries()];
}

/** Wichtigster Wert einer Zeile (rechts, tabellarisch) */
function hauptwert(a: ListenAktivitaet, istKraft: boolean): string {
  if (!istKraft && a.distanzM != null && a.distanzM > 100) return formatKm(a.distanzM);
  return formatDauer(a.dauerS);
}

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
  const loeschen = useActivityDelete();
  const toast = useToast();
  const [zuLoeschen, setZuLoeschen] = useState<ListenAktivitaet | null>(null);
  const [resync, setResync] = useState<{ done: number; total: number } | null>(null);

  /** Alle Aktivitäten der letzten 30 Tage sequenziell neu von Garmin holen */
  const alleAktualisieren = useCallback(async () => {
    const von = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const ids: number[] = [];
    let cur: string | null = null;
    // IDs des Zeitfensters einsammeln (paginiert)
    do {
      const p = new URLSearchParams({ von });
      if (cur) p.set("cursor", cur);
      const d = await fetch(`/api/activities?${p}`).then((r) => r.json());
      for (const a of d.aktivitaeten ?? []) ids.push(a.id);
      cur = d.nextCursor;
    } while (cur);

    if (ids.length === 0) {
      toast({ message: "Keine Aktivitäten in den letzten 30 Tagen." });
      return;
    }
    setResync({ done: 0, total: ids.length });
    let fehler = 0;
    for (let i = 0; i < ids.length; i++) {
      const res = await fetch(`/api/activities/${ids[i]}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipRecompute: true }),
      }).catch(() => null);
      if (!res || !res.ok || !(await res.json().catch(() => ({})))?.ok) fehler++;
      setResync({ done: i + 1, total: ids.length });
      await new Promise((r) => setTimeout(r, 350)); // Garmin schonen
    }
    // Neuberechnung einmal am Ende
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typ: "finalize" }),
    }).catch(() => null);
    setResync(null);
    lade(true);
    toast({
      message:
        fehler === 0
          ? `${ids.length} Aktivitäten aktualisiert.`
          : `${ids.length - fehler} aktualisiert, ${fehler} fehlgeschlagen.`,
      variant: fehler === 0 ? "default" : "error",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const entferneAusListe = useCallback((id: number) => {
    setAktivitaeten((alt) => alt.filter((x) => x.id !== id));
  }, []);
  const wiederEinfuegen = useCallback((a: ListenAktivitaet) => {
    setAktivitaeten((alt) =>
      [...alt, a].sort((x, y) => y.startZeit.localeCompare(x.startZeit))
    );
  }, []);

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
                "min-h-9 rounded-md px-3 text-sm transition-colors",
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
                "min-h-9 rounded-md px-3 text-sm transition-colors",
                zeitraum === z.id ? "bg-background font-medium" : "text-muted-foreground"
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={resync != null}
          onClick={alleAktualisieren}
        >
          <RefreshCw className={cn("size-4", resync != null && "animate-spin")} />
          {resync ? `${resync.done}/${resync.total}` : "Aktualisieren"}
        </Button>
      </div>

      {/* Zeilen mit Haarlinien-Trennern, nach Woche gruppiert — keine Karten */}
      <div className="space-y-5">
        {nachWoche(aktivitaeten).map(([montag, wocheAkt]) => (
          <div key={montag}>
            <div className="micro-label mb-1 border-b border-line-strong pb-1">
              {formatDatum(montag)} – {formatDatum(addTage(montag, 6))}
            </div>
            <div>
              {wocheAkt.map((a) => {
                const datum = new Date(a.startZeit);
                const istKraftTyp =
                  a.typ.includes("strength") || a.typ.includes("fitness");
                return (
                  <SwipeRow key={a.id} onDelete={() => setZuLoeschen(a)}>
                    <Link
                      href={`/activities/${a.id}`}
                      className="flex items-center gap-3 border-b border-line bg-background py-2.5 transition-colors active:bg-surface"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="micro-label flex items-center gap-1.5">
                          {istKraftTyp ? (
                            <Dumbbell className="size-3 text-text-dim" />
                          ) : (
                            <Footprints className="size-3 text-text-dim" />
                          )}
                          {datum.toLocaleDateString("de-CH", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          {" · "}
                          {formatZeit(datum)}
                        </div>
                        <div className="mt-0.5 truncate text-[15px] font-medium text-text">
                          {a.name ?? a.typ}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="stat-mono text-[17px] font-semibold text-text">
                          {hauptwert(a, istKraftTyp)}
                        </div>
                        {!istKraftTyp && a.avgPace != null && (
                          <div className="stat-mono text-[11px] text-text-muted">
                            {formatPace(a.avgPace)}
                          </div>
                        )}
                      </div>
                    </Link>
                  </SwipeRow>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {laedt && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-surface" />
          ))}
        </div>
      )}
      {!laedt && aktivitaeten.length === 0 && (
        <p className="py-10 text-center text-sm text-text-muted">
          Noch keine Aktivitäten. Uhr synchronisieren, um zu starten.
        </p>
      )}
      <div ref={sentinel} />

      <Dialog open={zuLoeschen != null} onOpenChange={(o) => !o && setZuLoeschen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aktivität aus dem Hub entfernen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            «{zuLoeschen?.name ?? zuLoeschen?.typ}» wird nur hier ausgeblendet.
            Bei Garmin Connect bleibt sie bestehen. Rückgängig direkt danach möglich.
          </p>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setZuLoeschen(null)}>
              Abbrechen
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-status-red/50 text-status-red hover:bg-status-red/10"
              onClick={() => {
                const a = zuLoeschen;
                setZuLoeschen(null);
                if (a)
                  loeschen(a.id, {
                    onRemoved: () => entferneAusListe(a.id),
                    onRestore: () => wiederEinfuegen(a),
                  });
              }}
            >
              Entfernen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
