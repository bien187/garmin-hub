"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink as Link, useIstDemo } from "@/components/basis-pfad";
import { RefreshCw } from "lucide-react";
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
    <div className="flex shrink-0 gap-0.5">
      {optionen.map((o) => (
        <button
          key={o.id}
          onClick={() => setzen(o.id)}
          aria-pressed={wert === o.id}
          className={cn(
            "min-h-9 whitespace-nowrap rounded-md px-2.5 text-[13px] transition-colors",
            wert === o.id ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
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

  return (
    <div className="pb-6">
      <header className="px-4 pt-5 pb-3 md:px-8 md:pt-8">
        <h1 className="text-[24px] leading-tight font-medium tracking-tight md:text-[28px]">Aktivitäten</h1>
        <p className="mt-0.5 text-xs text-dim-foreground tabular-nums">{syncStatusText(lastSync)}</p>
      </header>
      {/* Filterzeile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 pb-2 md:px-8">
        {segment(FILTER, typ, setTyp)}
        {segment(ZEITRAUM, zeitraum, setZeitraum)}
        {/* Garmin-Abgleich gibt es in der Demo nicht */}
        {!demo && (
        <button
          onClick={alleAktualisieren}
          disabled={resync != null}
          aria-label="Alle aktualisieren"
          className="ml-auto flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:text-foreground"
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
            <div key={i} className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-8">
              <div className="size-10 shrink-0 animate-pulse rounded-md bg-surface" />
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
            className="mt-3 min-h-10 rounded-md bg-surface px-4 text-sm"
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

      {/* Gruppen + Zeilen: flache Liste mit Trennlinien */}
      {gruppen.map((g) => {
        const laeufe = g.items.filter((a) => !istKraft(a.typ));
        const km = laeufe.reduce((s, a) => s + (a.distanzM ?? 0), 0) / 1000;
        return (
          <section key={g.label}>
            <div className="flex items-baseline justify-between px-4 pt-5 pb-1.5 md:px-8">
              <h2 className="text-[13px] font-medium">{g.label}</h2>
              <span className="text-xs text-muted-foreground">
                {g.items.length} {g.items.length === 1 ? "Einheit" : "Einheiten"}
                {km > 0.05 ? ` · ${km.toFixed(1)} km` : ""}
              </span>
            </div>
            <div className="border-t border-border">
              {g.items.map((a) => {
                const d = new Date(a.startZeit);
                const kraft = istKraft(a.typ);
                const hatKarte = !kraft && a.polyline;
                const meta = [
                  kurzDatum(d),
                  sportName(a.typ),
                  !kraft && a.distanzM ? formatDauer(a.dauerS) : null,
                  !kraft && a.avgPace != null ? formatPace(a.avgPace) : null,
                  a.avgHr != null ? `${Math.round(a.avgHr)} bpm` : null,
                  !kraft && a.hmAuf != null && a.hmAuf > 20 ? `${Math.round(a.hmAuf)} Hm` : null,
                ].filter(Boolean);
                return (
                  <SwipeRow
                    key={a.id}
                    onDelete={() => setZuLoeschen(a)}
                    collapsed={kollabiert.has(a.id)}
                    deaktiviert={demo}
                    hoehe={68}
                  >
                    <Link
                      href={`/activities/${a.id}`}
                      className="relative flex h-full items-center gap-3 border-b border-border px-4 transition-colors hover:bg-card md:px-8"
                    >
                      {hatKarte ? (
                        <PolylineSvg encoded={a.polyline} strokeWidth={4} className="size-10 rounded-md bg-surface" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface">
                          <SportIcon typ={a.typ} groesse="sm" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px]">{a.name ?? sportName(a.typ)}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{meta.join(" · ")}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        {kraft || !a.distanzM ? (
                          <span className="stat-display text-[17px]">{formatDauer(a.dauerS)}</span>
                        ) : (
                          <span className="stat-display text-[17px]">
                            {(a.distanzM / 1000).toFixed(2)}
                            <span className="ml-0.5 text-[11px] text-muted-foreground">km</span>
                          </span>
                        )}
                        {einzelResync === a.id && <RefreshCw className="gh-spin mt-1 ml-auto size-3 text-primary" />}
                      </div>
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
        <div className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-8">
          <div className="size-10 shrink-0 animate-pulse rounded-md bg-surface" />
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
