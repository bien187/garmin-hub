"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { Check, Pencil, Trash2, X } from "lucide-react";
import { EP_DISZIPLINEN, DisziplinId, berechneNote, benchmarkWertAlsText, notenFarbe, parseBenchmarkWert } from "@/lib/ep/disziplinen";
import { formatDatum, formatDauer, formatNote, heuteIso } from "@/lib/format";

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
  const [bearbeitet, setBearbeitet] = useState<{ id: string; wert: string; datum: string } | null>(null);
  const [speichert, setSpeichert] = useState(false);

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

  async function speichere(b: Benchmark) {
    if (!bearbeitet) return;
    const wert = parseBenchmarkWert(b.disziplin, bearbeitet.wert);
    if (wert == null) {
      toast({ message: b.disziplin === "lastlauf" ? "Zeit als mm:ss eingeben, z. B. 33:13." : "Bitte eine positive Zahl eingeben.", variant: "error" });
      return;
    }
    setSpeichert(true);
    try {
      const res = await fetch("/api/benchmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, wert, datum: bearbeitet.datum }),
      });
      if (!res.ok) throw new Error();
      setEintraege((alt) =>
        (alt ?? [])
          .map((e) => (e.id === b.id ? { ...e, wert, datum: bearbeitet.datum } : e))
          .sort((x, y) => y.datum.localeCompare(x.datum))
      );
      setBearbeitet(null);
      window.dispatchEvent(new Event("benchmarks-changed"));
      router.refresh();
      toast({ message: "Eintrag angepasst. Prognose aktualisiert." });
    } catch {
      toast({ message: "Speichern fehlgeschlagen. Bitte erneut versuchen.", variant: "error" });
    } finally {
      setSpeichert(false);
    }
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
        if (bearbeitet?.id === b.id) {
          const vorschau = parseBenchmarkWert(b.disziplin, bearbeitet.wert);
          return (
            <form
              key={b.id}
              className="space-y-2 rounded-lg border border-primary/40 bg-muted px-3 py-2 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                speichere(b);
              }}
            >
              <div className="font-medium">{d.kurzname} anpassen</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">
                  {b.disziplin === "lastlauf" ? "Zeit (mm:ss)" : d.einheit === "sekunden" ? "Sekunden" : "Wiederholungen"}
                  <input
                    className="mt-1 block min-h-11 w-28 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    inputMode={b.disziplin === "lastlauf" ? "text" : "numeric"}
                    value={bearbeitet.wert}
                    autoFocus
                    onChange={(e) => setBearbeitet({ ...bearbeitet, wert: e.target.value })}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Datum
                  <input
                    type="date"
                    max={heuteIso()}
                    className="mt-1 block min-h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    value={bearbeitet.datum}
                    onChange={(e) => setBearbeitet({ ...bearbeitet, datum: e.target.value })}
                  />
                </label>
                {vorschau != null && (
                  <span className="pb-3 text-xs text-muted-foreground">
                    → Note <span className="stat-mono font-semibold" style={{ color: notenFarbe(berechneNote(b.disziplin, vorschau)) }}>{formatNote(berechneNote(b.disziplin, vorschau))}</span>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={speichert} className="flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  <Check className="size-4" /> Speichern
                </button>
                <button type="button" onClick={() => setBearbeitet(null)} className="flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm">
                  <X className="size-4" /> Abbrechen
                </button>
              </div>
            </form>
          );
        }
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
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className="stat-display text-lg"
                style={{
                  color: notenFarbe(note),
                }}
              >
                {formatNote(note)}
              </span>
              <span className="stat-mono text-xs text-muted-foreground">
                {formatDatum(b.datum)}
              </span>
              <button
                onClick={() => setBearbeitet({ id: b.id, wert: benchmarkWertAlsText(b), datum: b.datum })}
                disabled={loescht !== null || speichert}
                aria-label={d.kurzname + ' vom ' + formatDatum(b.datum) + ' anpassen'}
                className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-40"
                title="Anpassen"
              >
                <Pencil className="size-3.5" />
              </button>
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
