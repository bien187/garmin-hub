/**
 * Banister-TRIMP (männlich):
 * TRIMP = Dauer_min × HRr × 0.64 × e^(1.92 × HRr)
 * mit HRr = (HRavg − HRruhe) / (HRmax − HRruhe)
 */
export function banisterTrimp(
  dauerS: number,
  hrAvg: number,
  hrRuhe: number,
  hrMax: number
): number {
  if (dauerS <= 0 || hrMax <= hrRuhe) return 0;
  const hrr = Math.min(1, Math.max(0, (hrAvg - hrRuhe) / (hrMax - hrRuhe)));
  if (hrr === 0) return 0;
  return (dauerS / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
}

/**
 * Session-RPE-Fallback für Krafttrainings ohne brauchbare HR:
 * TRIMP ≈ Dauer_min × Intensität. Intensität (RPE/10-ähnlich, 0.3–0.8)
 * wird aus dem Volumen relativ zu einer "harten" Referenzeinheit geschätzt.
 */
export function sessionRpeTrimp(
  dauerS: number,
  volumenKg: number,
  referenzVolumenKg = 8000
): number {
  if (dauerS <= 0) return 0;
  const rel = Math.min(1.5, volumenKg / referenzVolumenKg);
  const intensitaet = 0.3 + 0.5 * Math.min(1, rel);
  return (dauerS / 60) * intensitaet;
}

export interface TrimpInput {
  dauerS: number;
  avgHr: number | null;
  istKraft: boolean;
  volumenKg?: number;
  hrRuhe: number;
  hrMax: number;
}

/** Einheitliche TRIMP-Berechnung mit Fallback-Logik */
export function trimpFuerEinheit(e: TrimpInput): number {
  const hrBrauchbar = e.avgHr != null && e.avgHr > e.hrRuhe + 10;
  if (hrBrauchbar && !e.istKraft) {
    return banisterTrimp(e.dauerS, e.avgHr as number, e.hrRuhe, e.hrMax);
  }
  if (e.istKraft) {
    // Kraft: HR-TRIMP unterschätzt/überschätzt je nach Pausen — wenn HR da
    // ist, nimm das Maximum aus beiden Schätzern
    const rpe = sessionRpeTrimp(e.dauerS, e.volumenKg ?? 0);
    if (hrBrauchbar) {
      return Math.max(
        rpe,
        banisterTrimp(e.dauerS, e.avgHr as number, e.hrRuhe, e.hrMax)
      );
    }
    return rpe;
  }
  return hrBrauchbar
    ? banisterTrimp(e.dauerS, e.avgHr as number, e.hrRuhe, e.hrMax)
    : 0;
}
