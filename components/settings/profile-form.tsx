"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hrZonen } from "@/lib/profil-typen";

interface ProfilForm {
  hfMax: number;
  ruhepuls: number;
  gewichtKg: number;
  epDatum: string;
  lastZuschlagSproKmPro10kg: number;
}

export function ProfileForm() {
  const [form, setForm] = useState<ProfilForm | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setForm(d.profil))
      .catch(() => {});
  }, []);

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

  if (!form) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;

  const zonen = hrZonen({ ruhepuls: form.ruhepuls, hfMax: form.hfMax });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="micro-label">
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
        </div>
        <div>
          <label className="text-xs text-muted-foreground">EP-Datum (Tag 1)</label>
          <Input
            type="date"
            value={form.epDatum}
            onChange={(e) => setForm({ ...form, epDatum: e.target.value })}
            className="mt-1 w-44"
          />
        </div>
        <div className="stat-mono grid grid-cols-5 gap-1 text-center text-[11px]">
          {(["z1", "z2", "z3", "z4", "z5"] as const).map((z) => (
            <div key={z} className="rounded bg-muted/50 px-1 py-1.5">
              <div className="font-semibold uppercase">{z}</div>
              <div className="text-muted-foreground">
                {zonen[z].von}–{zonen[z].bis}
              </div>
            </div>
          ))}
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
