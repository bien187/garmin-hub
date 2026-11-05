"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink as Link, useIstDemo } from "@/components/basis-pfad";
import { RefreshCw } from "lucide-react";
import { PolylineSvg } from "./polyline-svg";
import { SwipeRow } from "./swipe-row";
import { useActivityDelete } from "./use-activity-delete";
import { useToast } from "@/components/ui/toast";
import { ConfirmSheet } from "@/components/ui/sheet-confirm";
import { formatDauer, formatPace, heuteIso, isoDatum, jetztMs, montagVon } from "@/lib/format";
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
  { id: "30", label: "30 T" },
  { id: "90", label: "90 T" },
] as const;

function istKraft(typ: string) {
  return typ.includes("strength") || typ.includes("fitness");
}

/** Kurzdatum „Mi 5.8." */
function kurzDatum(d: Date) {
  const wd = d.toLocaleDateString("de-CH", { weekday: "short" }).replace(".", "");
  return `${wd} ${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Gruppen-Label: Diese Woche · Letzte Woche · [Monat Jahr] */
function gruppenLabel(iso: string, heute: string): string {
  const woche = montagVon(iso);
  const dieseWoche = montagVon(heute);
  const letzteWoche = montagVon(isoDatum(new Date(new Date(heute + "T12:00").getTime() - 7 * 86_400_000)));
  if (woche === dieseWoche) return "Diese Woche";
  if (woche === letzteWoche) return "Letzte Woche";
  const d = new Date(iso + "T12:00");
  const m = d.toLocaleDateString("de-CH", { month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function syncStatusText(lastSync: string | null): string {
  if (!lastSync) return "noch nie synchronisiert";
  const d = new Date(lastSync);
  const diffS = (jetztMs() - d.getTime()) / 1000;
  if (diffS < 60) return "zuletzt synchronisiert · gerade eben";
  const heute = new Date(jetztMs());
  const gleich = d.toDateString() === heute.toDateString();
  const zeit = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  if (gleich) return `zuletzt synchronisiert · Heute ${zeit}`;
  const tag = d.toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "numeric" });
  return `zuletzt synchronisiert · ${tag}, ${zeit}`;
}

export function ActivityList() {
  const [aktivitaeten, setAktivitaeten] = useState<ListenAktivitaet[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [ersteLadung, setErsteLadung] = useState(true);
  const [fehler, setFehler] = useState(false);
  const [typ, setTyp] = useState<string>("alle");
  const [zeitraum, setZeitraum] = useState<string>("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ laedt: false, fertig: false, cursor: null as string | null });
  stateRef.current = { laedt, fertig, cursor };
  const loeschen = useActivityDelete();
  const toast = useToast();
  const [zuLoeschen, setZuLoeschen] = useState<ListenAktivitaet | null>(null);
  const [kollabiert, setKollabiert] = useState<Set<number>>(new Set());
  const [resync, setResync] = useState<{ done: number; total: number } | null>(null);
  const [einzelResync, setEinzelResync] = useState<number | null>(null);
  const heute = heuteIso();
  const demo = useIstDemo();

  const entferneAusListe = useCallback((id: number) => {
    setKollabiert((s) => new Set(s).add(id));
    window.setTimeout(() => {
      setAktivitaeten((alt) => alt.filter((x) => x.id !== id));
      setKollabiert((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 200);
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
      setFehler(false);
      const p = new URLSearchParams();
      const cur = reset ? null : stateRef.current.cursor;
      if (cur) p.set("cursor", cur);
      if (typ !== "alle") p.set("typ", typ);
      if (zeitraum) {
        const von = new Date(jetztMs() - Number(zeitraum) * 86_400_000);
        p.set("von", von.toISOString());
      }
      try {
        const res = await fetch(`/api/activities?${p}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const neue: ListenAktivitaet[] = data.aktivitaeten ?? [];
        setAktivitaeten((alt) => (reset ? neue : [...alt, ...neue]));
        setCursor(data.nextCursor);
        setFertig(!data.nextCursor);
        if (reset && data.lastSync !== undefined) setLastSync(data.lastSync);
      } catch {
        if (reset) setFehler(true);
      } finally {
        setLaedt(false);
        setErsteLadung(false);
      }
    },
    [typ, zeitraum]
  );

  useEffect(() => {
    setAktivitaeten([]);
    setCursor(null);
    setFertig(false);
    setErsteLadung(true);
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

  /* Sammel-Update letzte 30 Tage (sequenziell, Garmin-schonend) */
  const alleAktualisieren = useCallback(async () => {
    const von = new Date(jetztMs() - 30 * 86_400_000).toISOString();
    const ids: number[] = [];
    let cur: string | null = null;
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
    let fehlerN = 0;
    for (let i = 0; i < ids.length; i++) {
      setEinzelResync(ids[i]);
      const res = await fetch(`/api/activities/${ids[i]}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipRecompute: true }),
      }).catch(() => null);
      if (!res || !res.ok || !(await res.json().catch(() => ({})))?.ok) fehlerN++;
      setResync({ done: i + 1, total: ids.length });
      await new Promise((r) => setTimeout(r, 350));
    }
    setEinzelResync(null);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typ: "finalize" }),
    }).catch(() => null);
    setResync(null);
    lade(true);
    toast({
      message:
        fehlerN === 0
          ? `${ids.length} Aktivitäten aktualisiert.`
          : `${ids.length - fehlerN} aktualisiert, ${fehlerN} fehlgeschlagen.`,
      variant: fehlerN === 0 ? "default" : "error",
    });
  }, [toast, lade]);

  /* Segment-Renderer (4.1-Bauart) */
  const segment = <T extends string>(
    optionen: readonly { id: T; label: string }[],
    wert: T,
    setzen: (v: T) => void
  ) => (
    <div className="flex shrink-0 rounded-lg bg-muted p-0.5">
      {optionen.map((o) => (
        <button
          key={o.id}
          onClick={() => setzen(o.id)}
          className={cn(
            "min-h-10 whitespace-nowrap rounded-md px-2 text-[13px]",
            wert === o.id ? "bg-background font-semibold" : "text-muted-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  /* Zeilen in Gruppen bündeln */
  const gruppen: { label: string; items: ListenAktivitaet[] }[] = [];
  for (const a of aktivitaeten) {
    const label = gruppenLabel(isoDatum(new Date(a.startZeit)), heute);
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.label === label) letzte.items.push(a);
    else gruppen.push({ label, items: [a] });
  }

  let globalIdx = 0;

  return (
    <div>
      {/* Filterzeile */}
      <div className="flex items-center gap-1.5 px-4 pt-2 pb-1.5">
        {segment(FILTER, typ, setTyp)}
        {segment(ZEITRAUM, zeitraum, setZeitraum)}
        {/* Garmin-Abgleich gibt es in der Demo nicht */}
        {!demo && (
        <button
          onClick={alleAktualisieren}
          disabled={resync != null}
          aria-label="Alle aktualisieren"
          className="ml-auto flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2.5"
        >
          <RefreshCw className={cn("size-4.25", resync != null && "gh-spin")} />
          {resync != null && (
            <span className="stat-mono text-xs tabular-nums">
              {resync.done} von {resync.total}
            </span>
          )}
        </button>
        )}
      </div>

      {/* Sync-Statuszeile */}
      <div className="stat-mono px-4 pb-1 text-[10px] text-dim-foreground">
        {syncStatusText(lastSync)}
      </div>

      {/* Skeleton (exakt 60px-Zeilen) */}
      {ersteLadung && laedt && (
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-15 items-center gap-3 px-4">
              <div className="size-11 shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-9/12 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fehlerzustand */}
      {fehler && !laedt && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aktivitäten konnten nicht geladen werden — Verbindung prüfen.
          </p>
          <button
            onClick={() => lade(true)}
            className="mt-3 min-h-11 rounded-lg bg-muted px-4 text-sm font-medium"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Leerzustand */}
      {!laedt && !fehler && aktivitaeten.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Keine Aktivitäten für diesen Filter.
          </p>
          <p className="mt-1 text-[13px] text-dim-foreground">
            Filter zurücksetzen oder auf dem Dashboard synchronisieren.
          </p>
        </div>
      )}

      {/* Gruppen + Zeilen */}
      {gruppen.map((g) => {
        const laeufe = g.items.filter((a) => !istKraft(a.typ));
        const km = laeufe.reduce((s, a) => s + (a.distanzM ?? 0), 0) / 1000;
        return (
          <div key={g.label}>
            <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-dim-foreground">
                {g.label}
              </span>
              <span className="stat-mono text-[10.5px] text-dim-foreground">
                {g.items.length}
                {km > 0.05 ? ` · ${km.toFixed(1)} km` : ""}
              </span>
            </div>
            {g.items.map((a) => {
              const d = new Date(a.startZeit);
              const kraft = istKraft(a.typ);
              const idx = globalIdx++;
              const meta = kraft
                ? [kurzDatum(d), a.avgHr != null ? `Ø ${Math.round(a.avgHr)} bpm` : null]
                : [
                    kurzDatum(d),
                    formatDauer(a.dauerS),
                    a.avgPace != null ? formatPace(a.avgPace) : null,
                    a.hmAuf != null && a.hmAuf > 20 ? `${Math.round(a.hmAuf)} Hm` : null,
                    a.avgHr != null ? `${Math.round(a.avgHr)} bpm` : null,
                  ];
              return (
                <SwipeRow
                  key={a.id}
                  onDelete={() => setZuLoeschen(a)}
                  collapsed={kollabiert.has(a.id)}
                  deaktiviert={demo}
                >
                  <Link
                    href={`/activities/${a.id}`}
                    className="relative grid h-15 items-center gap-x-3 px-4 active:bg-[oklch(0.175_0.015_252)]"
                    style={{
                      gridTemplateColumns: "44px 1fr auto",
                      ...(idx < 8
                        ? { animation: `gh-row-in var(--dur-base) var(--ease-base) both`, animationDelay: `${idx * 25}ms` }
                        : {}),
                    }}
                  >
                    <PolylineSvg
                      encoded={kraft ? null : a.polyline}
                      strokeWidth={3.5}
                      className="size-11"
                    />
                    <div className="col-start-2 row-start-1 min-w-0 self-end">
                      <div className="truncate text-[14.5px] font-medium">
                        {a.name ?? a.typ}
                      </div>
                    </div>
                    <div className="col-start-3 row-start-1 self-end text-right">
                      {kraft ? (
                        <span className="stat-display text-[17px]">
                          {formatDauer(a.dauerS)}
                        </span>
                      ) : (
                        <span className="stat-display text-[17px]">
                          {((a.distanzM ?? 0) / 1000).toFixed(2)}
                          <span className="ml-0.75 text-[10px] font-normal text-dim-foreground">
                            km
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="stat-mono col-span-2 col-start-2 row-start-2 -mt-0.5 self-start truncate text-[10.5px] text-muted-foreground">
                      {meta.filter(Boolean).join(" · ")}
                    </div>
                    {einzelResync === a.id && (
                      <RefreshCw className="col-start-3 row-start-2 size-3 justify-self-end text-primary gh-spin" />
                    )}
                    <div className="absolute right-0 bottom-0 left-18 h-px bg-border" />
                  </Link>
                </SwipeRow>
              );
            })}
          </div>
        );
      })}

      {/* Nachlade-Skeleton */}
      {!ersteLadung && laedt && (
        <div className="flex h-15 items-center gap-3 px-4">
          <div className="size-11 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-9/12 animate-pulse rounded bg-muted" />
          </div>
        </div>
      )}
      <div ref={sentinel} />

      <ConfirmSheet
        open={zuLoeschen != null}
        onClose={() => setZuLoeschen(null)}
        title="Aktivität aus dem Hub entfernen?"
        description={
          <>
            «{zuLoeschen?.name ?? zuLoeschen?.typ}» wird nur hier ausgeblendet. Bei
            Garmin Connect bleibt sie bestehen. Rückgängig direkt danach möglich.
          </>
        }
        confirmLabel="Entfernen"
        danger
        onConfirm={() => {
          const a = zuLoeschen;
          if (a)
            loeschen(a.id, {
              onRemoved: () => entferneAusListe(a.id),
              onRestore: () => wiederEinfuegen(a),
            });
        }}
      />
    </div>
  );
}
