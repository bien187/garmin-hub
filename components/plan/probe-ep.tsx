"use client";

import { useState } from "react";
import { ChevronRight, Flag, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Metronome } from "./metronome";
import {
  berechneNote,
  bewerteEp,
  DisziplinId,
  EP_DISZIPLINEN,
  EP_REIHENFOLGE,
} from "@/lib/ep/disziplinen";
import { formatNote } from "@/lib/format";

/**
 * Probe-EP: geführter Ablauf aller 5 Disziplinen in Prüfungsreihenfolge
 * mit Timer/Metronom und Sofort-Benotung. Resultate werden als Benchmarks
 * gespeichert.
 */
export function ProbeEp() {
  const [schritt, setSchritt] = useState(0); // Index in EP_REIHENFOLGE; 5 = fertig
  const [werte, setWerte] = useState<Partial<Record<DisziplinId, number>>>({});
  const [eingabe, setEingabe] = useState("");
  const [minuten, setMinuten] = useState("");
  const [sekunden, setSekunden] = useState("");
  const [speichert, setSpeichert] = useState(false);

  const fertig = schritt >= EP_REIHENFOLGE.length;
  const aktuelleId = fertig ? null : EP_REIHENFOLGE[schritt];
  const d = aktuelleId ? EP_DISZIPLINEN[aktuelleId] : null;
  const istRumpf = aktuelleId === "rumpf_seitlich" || aktuelleId === "rumpf_dorsal";
  const istLastlauf = aktuelleId === "lastlauf";

  function weiter(wert: number) {
    if (!aktuelleId || wert <= 0) return;
    setWerte((w) => ({ ...w, [aktuelleId]: wert }));
    setEingabe("");
    setMinuten("");
    setSekunden("");
    setSchritt((s) => s + 1);
  }

  async function alleSpeichern() {
    setSpeichert(true);
    for (const [disziplin, wert] of Object.entries(werte)) {
      await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disziplin, wert, notiz: "Probe-EP" }),
      });
    }
    setSpeichert(false);
    setSchritt(EP_REIHENFOLGE.length + 1); // gespeichert-Zustand
  }

  const noten: Partial<Record<DisziplinId, number>> = {};
  for (const [id, wert] of Object.entries(werte)) {
    noten[id as DisziplinId] = berechneNote(id as DisziplinId, wert);
  }
  const ergebnis = bewerteEp(noten);

  if (fertig) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-2">
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Probe-EP Resultat
            </div>
            <div
              className="stat-display text-6xl"
              style={{
                color:
                  (ergebnis.schnitt ?? 0) >= 4.5
                    ? "var(--status-green)"
                    : (ergebnis.schnitt ?? 0) >= 4
                      ? "var(--status-yellow)"
                      : "var(--status-red)",
              }}
            >
              {formatNote(ergebnis.schnitt)}
            </div>
            <div className="text-sm text-muted-foreground">
              {ergebnis.bestanden
                ? "Bestanden — weiter Richtung 4.5+"
                : ergebnis.ausschluss.length > 0
                  ? `Nicht bestanden: 1.0 in ${ergebnis.ausschluss
                      .map((a) => EP_DISZIPLINEN[a].kurzname)
                      .join(", ")}`
                  : "Unter 4.0 — Schwachstellen im Plan nachschärfen"}
            </div>
          </div>
          <div className="space-y-1.5">
            {EP_REIHENFOLGE.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <span>{EP_DISZIPLINEN[id].kurzname}</span>
                <span className="stat-mono">
                  {werte[id] ?? "–"}
                  {EP_DISZIPLINEN[id].einheit === "sekunden" ? " s" : ""}
                  <span className="ml-2 font-semibold">{formatNote(noten[id])}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {schritt === EP_REIHENFOLGE.length && (
              <Button onClick={alleSpeichern} disabled={speichert} className="flex-1">
                <Flag className="size-4" />
                {speichert ? "Speichert…" : "Als Benchmarks speichern"}
              </Button>
            )}
            {schritt > EP_REIHENFOLGE.length && (
              <p className="flex-1 self-center text-center text-sm text-status-green">
                Gespeichert — die Prognose ist aktualisiert.
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setSchritt(0);
                setWerte({});
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          {EP_REIHENFOLGE.map((id, i) => (
            <div
              key={id}
              className={`h-1.5 flex-1 rounded-full ${
                i < schritt ? "bg-primary" : i === schritt ? "bg-primary/50" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Disziplin {schritt + 1}/5
          </div>
          <h3 className="stat-display text-2xl">{d!.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{d!.beschreibung}</p>
          {d!.stolperkante && (
            <p className="mt-1 text-xs text-status-orange">{d!.stolperkante.hinweis}</p>
          )}
        </div>

        {istRumpf && (
          <Metronome
            zielSekunden={d!.maxWert}
            onStop={(s) => setEingabe(String(s))}
          />
        )}

        <div className="flex items-end gap-2">
          {istLastlauf ? (
            <>
              <div className="w-24">
                <label className="text-xs text-muted-foreground">Minuten</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={minuten}
                  onChange={(e) => setMinuten(e.target.value)}
                />
              </div>
              <div className="w-24">
                <label className="text-xs text-muted-foreground">Sekunden</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={sekunden}
                  onChange={(e) => setSekunden(e.target.value)}
                />
              </div>
              <Button
                onClick={() => weiter((Number(minuten) || 0) * 60 + (Number(sekunden) || 0))}
                disabled={!minuten && !sekunden}
              >
                Weiter <ChevronRight className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <div className="w-36">
                <label className="text-xs text-muted-foreground">
                  {d!.einheit === "sekunden" ? "Sekunden" : "Wiederholungen"}
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={eingabe}
                  onChange={(e) => setEingabe(e.target.value)}
                />
              </div>
              <Button onClick={() => weiter(Number(eingabe))} disabled={!eingabe}>
                Weiter <ChevronRight className="size-4" />
              </Button>
            </>
          )}
          {eingabe && Number(eingabe) > 0 && aktuelleId && (
            <span className="pb-2 text-sm text-muted-foreground">
              → {formatNote(berechneNote(aktuelleId, Number(eingabe)))}
            </span>
          )}
        </div>

        {istLastlauf && (
          <p className="text-xs text-muted-foreground">
            5 km mit 20-kg-Rucksack + Kampfstiefel. Lauf zuerst, Zeit danach
            hier eintragen — die Uhr misst.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
