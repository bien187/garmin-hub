"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EP_DISZIPLINEN, DisziplinId, berechneNote, notenFarbe } from "@/lib/ep/disziplinen";
import { formatNote } from "@/lib/format";
import { DemoDeaktiviert, useIstDemo } from "@/components/basis-pfad";

/** Schnelleingabe für EP-Testresultate — speist Prognose & Plan */
export function BenchmarkForm({ onGespeichert }: { onGespeichert?: () => void }) {
  const demo = useIstDemo();
  const [disziplin, setDisziplin] = useState<DisziplinId>("klimmzuege");
  const [wert, setWert] = useState("");
  const [minuten, setMinuten] = useState("");
  const [sekunden, setSekunden] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [laedt, setLaedt] = useState(false);

  const d = EP_DISZIPLINEN[disziplin];
  const istLastlauf = disziplin === "lastlauf";
  const zahlWert = istLastlauf
    ? (Number(minuten) || 0) * 60 + (Number(sekunden) || 0)
    : Number(wert);
  const notenVorschau =
    zahlWert > 0 && isFinite(zahlWert) ? berechneNote(disziplin, zahlWert) : null;

  async function speichern() {
    if (!zahlWert || zahlWert <= 0) return;
    setLaedt(true);
    const res = await fetch("/api/benchmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disziplin, wert: zahlWert }),
    });
    setLaedt(false);
    if (res.ok) {
      setGespeichert(true);
      setWert("");
      setMinuten("");
      setSekunden("");
      setTimeout(() => setGespeichert(false), 2000);
      window.dispatchEvent(new Event('benchmarks-changed'));
      onGespeichert?.();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.values(EP_DISZIPLINEN) as (typeof d)[]).map((disp) => (
          <button
            key={disp.id}
            onClick={() => setDisziplin(disp.id)}
            className={`min-h-[38px] rounded-lg px-3 text-xs transition-colors ${
              disziplin === disp.id
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {disp.kurzname}
          </button>
        ))}
      </div>

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
                placeholder="33"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Sekunden</label>
              <Input
                type="number"
                inputMode="numeric"
                value={sekunden}
                onChange={(e) => setSekunden(e.target.value)}
                placeholder="30"
              />
            </div>
          </>
        ) : (
          <div className="w-36">
            <label className="text-xs text-muted-foreground">
              {d.einheit === "sekunden" ? "Sekunden gehalten" : "Wiederholungen"}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              value={wert}
              onChange={(e) => setWert(e.target.value)}
              placeholder={d.einheit === "sekunden" ? "90" : "8"}
            />
          </div>
        )}
        <Button onClick={speichern} disabled={demo || laedt || !zahlWert || zahlWert <= 0}>
          {gespeichert ? <Check className="size-4" /> : null}
          {gespeichert ? "Erfasst" : "Erfassen"}
        </Button>
        {notenVorschau != null && (
          <div className="pb-1.5 text-sm">
            → Note{" "}
            <span
              className="stat-display text-xl"
              style={{
                color: notenFarbe(notenVorschau),
              }}
            >
              {formatNote(notenVorschau)}
            </span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{d.beschreibung}</p>
      {demo && <DemoDeaktiviert />}
    </div>
  );
}
