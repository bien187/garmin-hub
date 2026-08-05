"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface StatusDaten {
  verbunden: boolean;
  tokenAktualisiert: string | null;
  anzahlAktivitaeten: number;
  anzahlHealthTage: number;
  log: { zeit: string; typ: string; verarbeitet: number; hasMore: boolean }[];
}

export function GarminCard() {
  const [status, setStatus] = useState<StatusDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMeldung, setMfaMeldung] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  const lade = useCallback(() => {
    fetch("/api/garmin/status")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Status nicht abrufbar");
        setStatus(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e.message));
  }, []);

  useEffect(lade, [lade]);

  async function sendeMfa() {
    setSendet(true);
    setMfaMeldung(null);
    const res = await fetch("/api/garmin/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: mfaCode.trim() }),
    });
    const data = await res.json();
    setSendet(false);
    if (res.ok) {
      setMfaMeldung("Login erfolgreich — Token gespeichert.");
      setMfaCode("");
      lade();
    } else {
      setMfaMeldung(data.error ?? "MFA-Login fehlgeschlagen");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          Garmin-Verbindung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fehler ? (
          <div className="flex items-start gap-2 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-status-red" />
            <div>
              <p>{fehler}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Die Python-Bridge läuft nur im Vercel-Deployment (lokal:{" "}
                <code>vercel dev</code>).
              </p>
            </div>
          </div>
        ) : status ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {status.verbunden ? (
                <>
                  <CheckCircle2 className="size-4 text-status-green" />
                  Verbunden — Token vom{" "}
                  {status.tokenAktualisiert
                    ? new Date(status.tokenAktualisiert).toLocaleString("de-CH")
                    : "?"}
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-status-orange" />
                  Noch kein Token — der erste Sync loggt sich mit den
                  ENV-Zugangsdaten ein.
                </>
              )}
            </div>
            <div className="stat-mono flex gap-4 text-xs text-muted-foreground">
              <span>{status.anzahlAktivitaeten} Aktivitäten</span>
              <span>{status.anzahlHealthTage} Gesundheits-Tage</span>
            </div>
            {status.log.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Sync-Log
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {status.log.map((l, i) => (
                    <div
                      key={i}
                      className="stat-mono flex justify-between rounded bg-muted/40 px-2 py-1 text-[11px]"
                    >
                      <span>
                        {new Date(l.zeit).toLocaleString("de-CH", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {l.typ}
                      </span>
                      <span>
                        {l.verarbeitet} Einträge{l.hasMore ? " …" : " ✓"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-muted/40" />
        )}

        {/* MFA */}
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <KeyRound className="size-3.5" /> MFA-Code (falls Garmin ihn verlangt)
          </div>
          <div className="flex gap-2">
            <Input
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              className="w-36"
            />
            <Button onClick={sendeMfa} disabled={sendet || mfaCode.trim().length < 4}>
              {sendet ? "Prüft…" : "Login abschliessen"}
            </Button>
          </div>
          {mfaMeldung && <p className="mt-1.5 text-xs">{mfaMeldung}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
