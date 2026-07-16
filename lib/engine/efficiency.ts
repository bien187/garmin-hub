/**
 * Ökonomie-Metriken — Bens grösste Schwäche, daher prominent.
 */

export interface EfInput {
  dauerS: number;
  distanzM: number;
  avgHr: number | null;
  hmAuf: number | null;
}

/**
 * Effizienz-Index (EF) = Geschwindigkeit (m/min) / Ø-HR.
 * Nur aussagekräftig für Läufe > 20 min mit < 50 Hm → sonst null.
 */
export function effizienzIndex(e: EfInput): number | null {
  if (e.avgHr == null || e.avgHr <= 0) return null;
  if (e.dauerS <= 20 * 60) return null;
  if ((e.hmAuf ?? 0) >= 50) return null;
  if (e.distanzM <= 0) return null;
  const mProMin = e.distanzM / (e.dauerS / 60);
  return mProMin / e.avgHr;
}

/**
 * Aerobe Entkopplung (Pw:HR) = (EF₁ − EF₂) / EF₁ über die beiden
 * Laufhälften (nach Zeit). < 5 % = solide aerobe Basis.
 * Streams: parallele Arrays; Einträge mit fehlender HR/Distanz werden übersprungen.
 */
export function aerobeEntkopplung(
  zeitS: number[],
  distanzM: (number | null)[],
  hr: (number | null)[]
): number | null {
  const n = Math.min(zeitS.length, distanzM.length, hr.length);
  if (n < 60) return null;
  const gesamtZeit = zeitS[n - 1] - zeitS[0];
  if (gesamtZeit < 20 * 60) return null;
  const mitte = zeitS[0] + gesamtZeit / 2;

  const haelfte = (von: number, bis: number): number | null => {
    let hrSumme = 0;
    let hrAnz = 0;
    let d0: number | null = null;
    let d1: number | null = null;
    let t0: number | null = null;
    let t1: number | null = null;
    for (let i = 0; i < n; i++) {
      if (zeitS[i] < von || zeitS[i] > bis) continue;
      const h = hr[i];
      const d = distanzM[i];
      if (h != null && h > 0) {
        hrSumme += h;
        hrAnz++;
      }
      if (d != null) {
        if (d0 == null) {
          d0 = d;
          t0 = zeitS[i];
        }
        d1 = d;
        t1 = zeitS[i];
      }
    }
    if (!hrAnz || d0 == null || d1 == null || t0 == null || t1 == null || t1 <= t0) {
      return null;
    }
    const speed = (d1 - d0) / ((t1 - t0) / 60); // m/min
    const avgHr = hrSumme / hrAnz;
    return avgHr > 0 ? speed / avgHr : null;
  };

  const ef1 = haelfte(zeitS[0], mitte);
  const ef2 = haelfte(mitte, zeitS[n - 1]);
  if (ef1 == null || ef2 == null || ef1 === 0) return null;
  return (ef1 - ef2) / ef1;
}

/**
 * Z2-Disziplin-Score für als "locker" geplante Läufe:
 * Anteil der Zeit in/unter Z2 sowie der Anteil ÜBER Z2.
 */
export function z2Disziplin(
  zeitS: number[],
  hr: (number | null)[],
  z2Von: number,
  z2Bis: number
): { anteilInZ2: number; anteilUeberZ2: number; zuHart: boolean } | null {
  const n = Math.min(zeitS.length, hr.length);
  if (n < 30) return null;
  let inZ2 = 0;
  let ueber = 0;
  let gesamt = 0;
  for (let i = 1; i < n; i++) {
    const dt = zeitS[i] - zeitS[i - 1];
    if (dt <= 0 || dt > 30) continue;
    const h = hr[i];
    if (h == null || h <= 0) continue;
    gesamt += dt;
    if (h > z2Bis) ueber += dt;
    else if (h >= z2Von) inZ2 += dt;
  }
  if (gesamt === 0) return null;
  const anteilUeberZ2 = ueber / gesamt;
  return {
    anteilInZ2: inZ2 / gesamt,
    anteilUeberZ2,
    zuHart: anteilUeberZ2 > 0.25,
  };
}

/** HR-Zonen-Zeitverteilung (für Detailseite) */
export function zonenVerteilung(
  zeitS: number[],
  hr: (number | null)[],
  zonen: { z1: { von: number; bis: number }; z2: { von: number; bis: number }; z3: { von: number; bis: number }; z4: { von: number; bis: number }; z5: { von: number; bis: number } }
): { zone: string; sekunden: number }[] {
  const n = Math.min(zeitS.length, hr.length);
  const acc = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  for (let i = 1; i < n; i++) {
    const dt = zeitS[i] - zeitS[i - 1];
    if (dt <= 0 || dt > 30) continue;
    const h = hr[i];
    if (h == null || h <= 0) continue;
    if (h <= zonen.z1.bis) acc.z1 += dt;
    else if (h <= zonen.z2.bis) acc.z2 += dt;
    else if (h <= zonen.z3.bis) acc.z3 += dt;
    else if (h <= zonen.z4.bis) acc.z4 += dt;
    else acc.z5 += dt;
  }
  return Object.entries(acc).map(([zone, sekunden]) => ({ zone: zone.toUpperCase(), sekunden }));
}
