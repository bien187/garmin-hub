"use client";

import { useState } from "react";
import { Sparkles, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AdhocErgebnis {
  planId: string | null;
  struktur: { name: string };
  erwarteterTrimp: number;
  tsbMorgen: number | null;
  tsbHeute: number | null;
  hinweis: string | null;
  routenVorschlaege: { id: string; name: string; distanzM: number; hmAuf: number }[];
}

/** „Heute frei Schnauze": Wunsch → Workout mit echten Zonen-Paces */
export function WorkoutGenerator() {
  const [modus, setModus] = useState<"distanz" | "dauer">("distanz");
  const [distanzKm, setDistanzKm] = useState("8");
  const [dauerMin, setDauerMin] = useState("45");
  const [anstrengung, setAnstrengung] = useState<"locker" | "mittel" | "hart">("locker");
  const [mitHm, setMitHm] = useState(false);
  const [ergebnis, setErgebnis] = useState<AdhocErgebnis | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  async function generiere() {
    setLaedt(true);
    setMeldung(null);
    const res = await fetch("/api/plan/adhoc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanzM: modus === "distanz" ? Number(distanzKm) * 1000 : undefined,
        dauerMin: modus === "dauer" ? Number(dauerMin) : undefined,
        anstrengung,
        mitHm,
        speichern: true,
      }),
    });
    setLaedt(false);
    if (res.ok) setErgebnis(await res.json());
    else setMeldung("Generierung fehlgeschlagen.");
  }

  async function aufDieUhr() {
    if (!ergebnis?.planId) return;
    setMeldung("Sende an Garmin…");
    const res = await fetch(`/api/plan/${ergebnis.planId}/push`, { method: "POST" });
    const data = await res.json();
    setMeldung(res.ok ? data.hinweis : (data.error ?? "Push fehlgeschlagen"));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex rounded-lg bg-muted p-0.5">
            {(["distanz", "dauer"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModus(m)}
                className={cn(
                  "min-h-9 flex-1 rounded-md text-sm",
                  modus === m ? "bg-background font-medium" : "text-muted-foreground"
                )}
              >
                {m === "distanz" ? "Distanz" : "Dauer"}
              </button>
            ))}
          </div>
          {modus === "distanz" ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={distanzKm}
                onChange={(e) => setDistanzKm(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">km</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={dauerMin}
                onChange={(e) => setDauerMin(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">Min</span>
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Anstrengung</div>
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["locker", "mittel", "hart"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAnstrengung(a)}
                className={cn(
                  "min-h-10 flex-1 rounded-md text-sm capitalize",
                  anstrengung === a ? "bg-background font-medium" : "text-muted-foreground"
                )}
              >
                {a}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mitHm}
              onChange={(e) => setMitHm(e.target.checked)}
              className="size-4 accent-primary"
            />
            Mit Höhenmetern
          </label>
        </div>
      </div>

      <Button onClick={generiere} disabled={laedt} className="w-full sm:w-auto">
        <Sparkles className="size-4" />
        {laedt ? "Baut Workout…" : "Workout bauen"}
      </Button>

      {meldung && (
        <p className="cursor-pointer text-xs text-muted-foreground" onClick={() => setMeldung(null)}>
          {meldung}
        </p>
      )}

      {ergebnis && (
        <Card>
          <CardContent className="space-y-3 pt-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{ergebnis.struktur.name}</div>
                <div className="stat-mono mt-0.5 text-xs text-muted-foreground">
                  Erwartet ~{ergebnis.erwarteterTrimp} TRIMP
                </div>
              </div>
              <Button size="sm" onClick={aufDieUhr}>
                <Watch className="size-4" /> Auf die Uhr
              </Button>
            </div>
            {ergebnis.tsbMorgen != null && (
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  ergebnis.tsbMorgen < -10
                    ? "bg-status-orange/10 text-status-orange"
                    : "bg-muted"
                )}
              >
                Nach diesem Lauf: TSB {ergebnis.tsbMorgen > 0 ? "+" : ""}
                {ergebnis.tsbMorgen} morgen
                {ergebnis.hinweis ? ` — ${ergebnis.hinweis.split("—")[1] ?? ""}` : ""}
              </div>
            )}
            {ergebnis.routenVorschlaege.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  Passende Routen mit Höhenmetern:
                </div>
                <div className="space-y-1">
                  {ergebnis.routenVorschlaege.map((r) => (
                    <div
                      key={r.id}
                      className="stat-mono flex justify-between rounded-lg bg-muted px-3 py-1.5 text-xs"
                    >
                      <span>{r.name}</span>
                      <span>
                        {formatKm(r.distanzM)} · ↑{Math.round(r.hmAuf)} m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Das Workout liegt auch als geplante Einheit von heute in der Wochenansicht.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
