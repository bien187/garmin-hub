"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink as Link, useIstDemo } from "@/components/basis-pfad";
import { Clock3, Gauge, HeartPulse, Mountain, RefreshCw } from "lucide-react";
import { PolylineSvg } from "./polyline-svg";
import { SportIcon } from "@/components/sport-icon";
import { sportName } from "@/lib/engine/sport";
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
    <div className="flex shrink-0 rounded-full bg-surface p-1">
      {optionen.map((o) => (
        <button
          key={o.id}
          onClick={() => setzen(o.id)}
          aria-pressed={wert === o.id}
          className={cn(
            "min-h-9 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors",
            wert === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
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
    <div className="pb-6">
      <header className="px-4 pt-4 pb-3 md:pt-6">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight md:text-[30px]">Aktivitäten</h1>
        <p className="stat-mono mt-0.5 text-[11px] text-dim-foreground">{syncStatusText(lastSync)}</p>
      </header>
      {/* Filterzeile */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        {segment(FILTER, typ, setTyp)}
        {segment(ZEITRAUM, zeitraum, setZeitraum)}
        {/* Garmin-Abgleich gibt es in der Demo nicht */}
        {!demo && (
        <button
          onClick={alleAktualisieren}
          disabled={resync != null}
          aria-label="Alle aktualisieren"
          className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface px-3 transition-colors hover:bg-surface-2"
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


      {/* Skeleton (exakt 60px-Zeilen) */}
      {ersteLadung && laedt && (
        <div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mx-4 mb-2 flex h-19 items-center gap-3 rounded-xl bg-card px-3">
              <div className="size-12 shrink-0 animate-pulse rounded-[14px] bg-surface" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface" />
                <div className="h-2.5 w-9/12 animate-pulse rounded bg-surface" />
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
            className="mt-3 min-h-11 rounded-full bg-surface px-5 text-sm font-medium"
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
          <section key={g.label} className="px-4 pt-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="kachel-titel">{g.label}</h2>
              <span className="stat-mono rounded-full bg-surface px-2.5 py-0.5 text-[11px] text-muted-foreground">
                {g.items.length} {g.items.length === 1 ? "Einheit" : "Einheiten"}
                {km > 0.05 ? ` · ${km.toFixed(1)} km` : ""}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-white/[0.055]">
              {g.items.map((a, i) => {
                const d = new Date(a.startZeit);
                const kraft = istKraft(a.typ);
                const idx = globalIdx++;
                const hatKarte = !kraft && a.polyline;
                return (
                  <SwipeRow
                    key={a.id}
                    onDelete={() => setZuLoeschen(a)}
                    collapsed={kollabiert.has(a.id)}
                    deaktiviert={demo}
                    hoehe={76}
                  >
                    <Link
                      href={`/activities/${a.id}`}
                      className="relative flex h-full items-center gap-3 px-3 transition-colors hover:bg-white/[0.02] active:bg-white/[0.04]"
                      style={
                        idx < 8
                          ? { animation: `gh-row-in var(--dur-base) var(--ease-base) both`, animationDelay: `${idx * 25}ms` }
                          : undefined
                      }
                    >
                      {hatKarte ? (
                        <div className="relative shrink-0">
                          <PolylineSvg encoded={a.polyline} strokeWidth={3.5} className="size-12 rounded-[14px] bg-coral/10" />
                          <SportIcon typ={a.typ} groesse="sm" className="absolute -right-1.5 -bottom-1.5 size-5.5 rounded-md ring-2 ring-card [&_svg]:size-3" />
                        </div>
                      ) : (
                        <SportIcon typ={a.typ} groesse="lg" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-[15px] font-medium">{a.name ?? sportName(a.typ)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {kurzDatum(d)} · {sportName(a.typ)}
                        </div>
                        <div className="stat-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {/* Dauer nur hier, wenn rechts die Distanz steht */}
                          {!kraft && !!a.distanzM && (
                            <span className="flex items-center gap-1">
                              <Clock3 className="size-3 text-dim-foreground" />
                              {formatDauer(a.dauerS)}
                            </span>
                          )}
                          {!kraft && a.avgPace != null && (
                            <span className="flex items-center gap-1">
                              <Gauge className="size-3 text-dim-foreground" />
                              {formatPace(a.avgPace)}
                            </span>
                          )}
                          {a.avgHr != null && (
                            <span className="flex items-center gap-1">
                              <HeartPulse className="size-3 text-dim-foreground" />
                              {Math.round(a.avgHr)}
                            </span>
                          )}
                          {!kraft && a.hmAuf != null && a.hmAuf > 20 && (
                            <span className="hidden items-center gap-1 min-[400px]:flex">
                              <Mountain className="size-3 text-dim-foreground" />
                              {Math.round(a.hmAuf)} Hm
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {kraft || !a.distanzM ? (
                          <span className="stat-display text-xl">{formatDauer(a.dauerS)}</span>
                        ) : (
                          <span className="stat-display text-xl">
                            {(a.distanzM / 1000).toFixed(2)}
                            <span className="ml-0.5 text-[11px] font-normal text-dim-foreground">km</span>
                          </span>
                        )}
                        {einzelResync === a.id && (
                          <RefreshCw className="gh-spin ml-auto mt-1 size-3 text-primary" />
                        )}
                      </div>
                      {i < g.items.length - 1 && (
                        <div className="absolute right-0 bottom-0 left-18 h-px bg-white/[0.05]" />
                      )}
                    </Link>
                  </SwipeRow>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Nachlade-Skeleton */}
      {!ersteLadung && laedt && (
        <div className="mx-4 mt-2 flex h-19 items-center gap-3 rounded-xl bg-card px-3">
          <div className="size-12 shrink-0 animate-pulse rounded-[14px] bg-surface" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface" />
            <div className="h-2.5 w-9/12 animate-pulse rounded bg-surface" />
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
