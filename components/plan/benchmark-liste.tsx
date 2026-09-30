"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { Trash2 } from "lucide-react";
import { EP_DISZIPLINEN, DisziplinId, berechneNote } from "@/lib/ep/disziplinen";
import { formatDatum, formatDauer, formatNote } from "@/lib/format";

interface Benchmark {
  id: string;
  datum: string;
  disziplin: DisziplinId;
  wert: number;
  notiz: string | null;
}

export function BenchmarkListe() {
  const router = useRouter();
  const toast = useToast();
  const [loescht, setLoescht] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  const [eintraege, setEintraege] = useState<Benchmark[] | null>(null);

  const lade = useCallback(() => {
    fetch("/api/benchmarks")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setFehler(false); setEintraege(d.benchmarks ?? []); })
      .catch(() => setFehler(true));
  }, []);

  useEffect(() => {
    lade();
    window.addEventListener('benchmarks-changed', lade);
    return () => window.removeEventListener('benchmarks-changed', lade);
  }, [lade]);

  async function loesche(id: string) {
    setLoescht(id);
    try {
      const res = await fetch('/api/benchmarks?id=' + encodeURIComponent(id), {method:'DELETE'});
      if (!res.ok) throw new Error('Eintrag konnte nicht gelöscht werden.');
      setEintraege(alt => alt?.filter(b => b.id !== id) ?? []);
      window.dispatchEvent(new Event('benchmarks-changed'));
      router.refresh();
      toast({message:'Eintrag gelöscht. Prognose aktualisiert.'});
    } catch {
      toast({message:'Löschen fehlgeschlagen. Bitte erneut versuchen.',variant:'error'});
    } finally { setLoescht(null); }
  }

  if (fehler) return <button className="min-h-11 text-sm text-status-red" onClick={lade}>Einträge konnten nicht geladen werden. Erneut versuchen</button>;
  if (eintraege === null) {
    return <div className="h-20 animate-pulse rounded-xl bg-muted" />;
  }
  if (eintraege.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Benchmarks erfasst. Jeder Eintrag verbessert die Prognose.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Verlauf
      </div>
      {eintraege.map((b) => {
        const d = EP_DISZIPLINEN[b.disziplin];
        const note = berechneNote(b.disziplin, b.wert);
        return (
          <div
            key={b.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{d.kurzname}</span>
              <span className="stat-mono ml-2 text-muted-foreground">
                {b.disziplin === "lastlauf"
                  ? formatDauer(b.wert)
                  : `${b.wert}${d.einheit === "sekunden" ? " s" : ""}`}
              </span>
              {b.notiz && (
                <span className="ml-2 text-xs text-muted-foreground">({b.notiz})</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className="stat-display text-lg"
                style={{
                  color:
                    note >= 4.5
                      ? "var(--status-green)"
                      : note >= 4
                        ? "var(--status-yellow)"
                        : "var(--status-red)",
                }}
              >
                {formatNote(note)}
              </span>
              <span className="stat-mono text-xs text-muted-foreground">
                {formatDatum(b.datum)}
              </span>
              <button
                onClick={() => loesche(b.id)}
                disabled={loescht !== null}
                aria-label={d.kurzname + ' vom ' + formatDatum(b.datum) + ' löschen'}
                className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-status-red disabled:opacity-40"
                title="Löschen"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
