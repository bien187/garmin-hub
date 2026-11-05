"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { zonenAusProfil, type ZonenSatz } from "@/lib/hr-zonen";
import { cn } from "@/lib/utils";
import { formatDatumNumerisch } from "@/lib/format";
import { EP_DATUM, EP_TAG_2 } from "@/lib/ep/konstanten";

interface ProfilForm {
  hfMax: number;
  ruhepuls: number;
  gewichtKg: number;
  lastZuschlagSproKmPro10kg: number;
  wochenBudgetH: number;
}

export function ProfileForm() {
  const [form, setForm] = useState<ProfilForm | null>(null);
  const [zonenServer, setZonenServer] = useState<ZonenSatz | null>(null);
  const [zonenStand, setZonenStand] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [holt, setHolt] = useState(false);
  const [zonenFehler, setZonenFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const d = await fetch("/api/settings").then((r) => r.json());
    setForm(d.profil);
    setZonenServer(d.zonen ?? null);
    setZonenStand(d.zonenAktualisiert ?? null);
  }, []);

  useEffect(() => {
    laden().catch(() => {});
  }, [laden]);

  /* Zonen frisch von Garmin holen (ein Request, kein voller Sync) */
  async function zonenHolen() {
    setHolt(true);
    setZonenFehler(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typ: "zonen" }),
      });
      const d = await res.json();
      if (!res.ok || d.verarbeitet === 0) {
        throw new Error(d.error ?? "Garmin hat keine Zonen geliefert.");
      }
      await laden();
    } catch (e) {
      setZonenFehler(e instanceof Error ? e.message : "Fehlgeschlagen");
    } finally {
      setHolt(false);
    }
  }

  async function speichern() {
    if (!form) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
    }
  }

  if (!form) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  /* Garmin-Zonen sind gesetzt; ohne sie zeigt die Vorschau live, was die
     Karvonen-Rechnung aus den eingetippten Werten macht. */
  const ausGarmin = zonenServer?.quelle === "garmin";
  const zonen: ZonenSatz = ausGarmin
    ? (zonenServer as ZonenSatz)
    : zonenAusProfil({ ruhepuls: form.ruhepuls, hfMax: form.hfMax });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Profil & Zonen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Feld
            label="HFmax (bpm)"
            hinweis="Schätzung — Max-Puls-Test folgt"
            wert={form.hfMax}
            onChange={(v) => setForm({ ...form, hfMax: v })}
          />
          <Feld
            label="Ruhepuls"
            hinweis="wird vom Sync überschrieben"
            wert={form.ruhepuls}
            onChange={(v) => setForm({ ...form, ruhepuls: v })}
          />
          <Feld
            label="Gewicht (kg)"
            wert={form.gewichtKg}
            onChange={(v) => setForm({ ...form, gewichtKg: v })}
          />
          <Feld
            label="Last-Zuschlag s/km/10kg"
            hinweis="wird auto-kalibriert"
            wert={form.lastZuschlagSproKmPro10kg}
            onChange={(v) => setForm({ ...form, lastZuschlagSproKmPro10kg: v })}
          />
          <Feld
            label="Wochen-Budget (h)"
            hinweis="Trainingszeit pro Woche (Konsistenz)"
            wert={form.wochenBudgetH}
            onChange={(v) => setForm({ ...form, wochenBudgetH: v })}
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">EP-Termin</div>
          <div className="mt-1 text-sm">
            EP: {formatDatumNumerisch(EP_DATUM)} (fix)
            <span className="text-muted-foreground"> · Tag 2: {formatDatumNumerisch(EP_TAG_2)}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Herzfrequenz-Zonen
              {ausGarmin ? ` · Laufen (${zonen.sport})` : ""}
            </span>
            <button
              onClick={zonenHolen}
              disabled={holt}
              className="flex min-h-8 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-xs"
            >
              <RefreshCw className={cn("size-3.5", holt && "gh-spin")} />
              Von Garmin holen
            </button>
          </div>
          <div className="stat-mono grid grid-cols-5 gap-1 text-center text-[11px]">
            {(["z1", "z2", "z3", "z4", "z5"] as const).map((z) => (
              <div key={z} className="rounded bg-muted px-1 py-1.5">
                <div className="font-semibold uppercase">{z}</div>
                <div className="text-muted-foreground">
                  {zonen[z].von}–{zonen[z].bis}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {ausGarmin
              ? `Aus Garmin übernommen${zonenStand ? ` · Stand ${new Date(zonenStand).toLocaleDateString("de-CH")}` : ""} — Plan, Zonenverteilung und Workout-Ziele rechnen mit genau diesen Grenzen.`
              : "Noch keine Garmin-Zonen synchronisiert — bis dahin Karvonen-Schätzung aus HFmax und Ruhepuls. Diese kann von der Uhr abweichen."}
            {zonen.lthr != null ? ` Laktatschwelle ${zonen.lthr} bpm.` : ""}
          </p>
          {zonenFehler && (
            <p className="text-[10px] text-status-red">{zonenFehler}</p>
          )}
        </div>
        <Button onClick={speichern}>
          {gespeichert ? <Check className="size-4" /> : null}
          {gespeichert ? "Gespeichert" : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Feld({
  label,
  wert,
  onChange,
  hinweis,
}: {
  label: string;
  wert: number;
  onChange: (v: number) => void;
  hinweis?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        inputMode="decimal"
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1"
      />
      {hinweis && <p className="mt-0.5 text-[10px] text-muted-foreground">{hinweis}</p>}
    </div>
  );
}
