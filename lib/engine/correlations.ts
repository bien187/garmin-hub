/**
 * Korrelations-Insights: Pearson-r über Metrik-Paare der letzten 60–90 Tage.
 * Nur |r| ≥ 0.3 und n ≥ 15 werden angezeigt; klar als Korrelation gelabelt.
 */

export interface KorrelationsErgebnis {
  r: number;
  n: number;
  punkte: { x: number; y: number }[];
}

export function pearson(
  paare: { x: number | null; y: number | null }[]
): KorrelationsErgebnis | null {
  const punkte = paare.filter(
    (p): p is { x: number; y: number } =>
      p.x != null && p.y != null && isFinite(p.x) && isFinite(p.y)
  );
  const n = punkte.length;
  if (n < 3) return null;
  const mx = punkte.reduce((s, p) => s + p.x, 0) / n;
  const my = punkte.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of punkte) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return { r: sxy / Math.sqrt(sxx * syy), n, punkte };
}

/**
 * Ausgleichsgerade (kleinste Quadrate), zurückgegeben als ihre beiden
 * Endpunkte über die Spannweite der Daten — genau das, was ein Chart zum
 * Zeichnen einer Linie braucht.
 *
 * Sie macht das r einer Insight-Kachel sichtbar. Die Punkte in ihrer
 * zeitlichen Reihenfolge zu verbinden wäre die falsche Linie: bei einer
 * Streuung über Tage ergäbe das nur Zickzack ohne Aussage.
 */
export function ausgleichsgerade(
  punkte: { x: number; y: number }[]
): { x: number; y: number }[] {
  const gueltig = punkte.filter((p) => isFinite(p.x) && isFinite(p.y));
  const n = gueltig.length;
  if (n < 3) return [];
  const mx = gueltig.reduce((s, p) => s + p.x, 0) / n;
  const my = gueltig.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of gueltig) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  if (sxx === 0) return [];
  const steigung = sxy / sxx;
  const achsenabschnitt = my - steigung * mx;
  const xs = gueltig.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  if (xMin === xMax) return [];
  return [
    { x: xMin, y: achsenabschnitt + steigung * xMin },
    { x: xMax, y: achsenabschnitt + steigung * xMax },
  ];
}

export interface InsightKarte {
  id: string;
  titel: string;
  text: string;
  r: number;
  n: number;
  punkte: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
}

export interface KorrelationsInput {
  /** pro Tag; parallele Reihen über denselben Zeitraum */
  tage: {
    datum: string;
    schlafDauerH: number | null;
    schlafScore: number | null;
    hrv: number | null;
    ruhepuls: number | null;
    ctl: number | null;
    /** EF des Folgetags (bereits verschoben) */
    efFolgetag: number | null;
    trimp: number | null;
    wadenErschoepfung: number | null;
    hmTag: number | null;
  }[];
}

const PAARE: {
  id: string;
  titel: string;
  x: keyof KorrelationsInput["tage"][number];
  y: keyof KorrelationsInput["tage"][number];
  xLabel: string;
  yLabel: string;
  deutung: (r: number) => string;
}[] = [
  {
    id: "schlaf_ef",
    titel: "Schlafdauer → Laufökonomie am Folgetag",
    x: "schlafDauerH",
    y: "efFolgetag",
    xLabel: "Schlaf (h)",
    yLabel: "EF Folgetag",
    deutung: (r) =>
      r > 0
        ? "Mehr Schlaf geht bei dir mit besserer Laufökonomie am Folgetag einher."
        : "Längerer Schlaf fällt bei dir mit schlechterer Folgetags-Ökonomie zusammen — vermutlich schläfst du nach harten Tagen länger.",
  },
  {
    id: "schlafscore_ef",
    titel: "Schlaf-Score → Laufökonomie am Folgetag",
    x: "schlafScore",
    y: "efFolgetag",
    xLabel: "Schlaf-Score",
    yLabel: "EF Folgetag",
    deutung: (r) =>
      r > 0
        ? "Guter Schlaf (Score) korreliert mit effizienteren Läufen am Tag danach."
        : "Hoher Schlaf-Score korreliert negativ mit der Folgetags-Effizienz.",
  },
  {
    id: "hrv_trimp",
    titel: "Trainingslast → HRV",
    x: "trimp",
    y: "hrv",
    xLabel: "TRIMP",
    yLabel: "HRV (ms)",
    deutung: (r) =>
      r < 0
        ? "Harte Tage drücken deine HRV — beobachte das vor Schlüsseleinheiten."
        : "Deine HRV verträgt die aktuelle Last gut.",
  },
  {
    id: "hm_waden",
    titel: "Höhenmeter → Waden-Erschöpfung",
    x: "hmTag",
    y: "wadenErschoepfung",
    xLabel: "Hm/Tag",
    yLabel: "Waden-Erschöpfung %",
    deutung: () =>
      "Höhenmeter schlagen direkt auf die Waden durch — relevant für deine Krampf-Historie ab ~1000 Hm.",
  },
  {
    id: "ruhepuls_ctl",
    titel: "Fitness (CTL) → Ruhepuls",
    x: "ctl",
    y: "ruhepuls",
    xLabel: "CTL",
    yLabel: "Ruhepuls",
    deutung: (r) =>
      r < 0
        ? "Steigende Fitness senkt deinen Ruhepuls — die Basis wirkt."
        : "Ruhepuls steigt mit der Last — mögliche Übermüdung im Blick behalten.",
  },
];

export function korrelationsInsights(
  input: KorrelationsInput,
  minR = 0.3,
  minN = 15
): InsightKarte[] {
  const karten: InsightKarte[] = [];
  for (const p of PAARE) {
    const paare = input.tage.map((t) => ({
      x: t[p.x] as number | null,
      y: t[p.y] as number | null,
    }));
    const erg = pearson(paare);
    if (!erg || erg.n < minN || Math.abs(erg.r) < minR) continue;
    karten.push({
      id: p.id,
      titel: p.titel,
      text: p.deutung(erg.r),
      r: erg.r,
      n: erg.n,
      punkte: erg.punkte,
      xLabel: p.xLabel,
      yLabel: p.yLabel,
    });
  }
  return karten.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}
