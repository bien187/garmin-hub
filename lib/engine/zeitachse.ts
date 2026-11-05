import { addTage, tageDiff } from '@/lib/format';

/**
 * Zeitachse der Verlaufs-Charts (Fitness, Pace bei gleichem Puls):
 * Zeitraum-Umschalter und Achsenticks als reine Funktionen.
 *
 * Gefiltert wird clientseitig auf den gelieferten Punkten (seit
 * Trainingsstart) — der Umschalter braucht keine zusätzlichen Requests.
 * Bezugspunkt ist das letzte Datum der Reihe (= heute), damit der Filter
 * nicht von der Zeitzone des Browsers abhängt.
 */

export type Zeitraum = '90t' | '6m' | 'alles';

export const ZEITRAEUME: readonly { id: Zeitraum; label: string }[] = [
  { id: '90t', label: '90 Tage' },
  { id: '6m', label: '6 Mon.' },
  { id: 'alles', label: 'Alles' },
];

/** Ab dieser Spannweite (in Tagen) zeigt die Achse Monate statt Tage */
export const MONATSTICKS_AB_TAGEN = 120;

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** ISO-Datum um n Monate verschieben; Monatsende wird geklemmt (31.08. − 6 Mon. → 28./29.02.) */
export function addMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const ziel = j * 12 + (m - 1) + monate;
  const jahr = Math.floor(ziel / 12);
  const monat = ziel - jahr * 12; // 0..11
  const letzterTag = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
  const tag = Math.min(t, letzterTag);
  return `${jahr}-${String(monat + 1).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

/** Erstes enthaltenes Datum eines Zeitraums relativ zu `bis`; null = keine Untergrenze */
export function zeitraumVon(zeitraum: Zeitraum, bis: string): string | null {
  if (zeitraum === '90t') return addTage(bis, -90);
  if (zeitraum === '6m') return addMonate(bis, -6);
  return null;
}

/** Punkte auf den Zeitraum beschränken (Reihe aufsteigend nach Datum sortiert) */
export function filtereZeitraum<T>(punkte: readonly T[], datumVon: (p: T) => string, zeitraum: Zeitraum): T[] {
  if (punkte.length === 0) return [];
  const von = zeitraumVon(zeitraum, datumVon(punkte[punkte.length - 1]));
  return von == null ? [...punkte] : punkte.filter((p) => datumVon(p) >= von);
}

/**
 * Zeiträume, die sich von „Alles" unterscheiden. Beginnt die Reihe erst nach
 * der 6-Monats-Grenze, wäre „6 Mon." identisch mit „Alles" und entfällt.
 * Bleibt nur „Alles", wird der Umschalter gar nicht gezeigt.
 */
export function verfuegbareZeitraeume(erstesDatum: string | null, bis: string | null): Zeitraum[] {
  if (!erstesDatum || !bis) return ['alles'];
  return ZEITRAEUME.map((z) => z.id).filter((id) => {
    const von = zeitraumVon(id, bis);
    return von == null || erstesDatum < von;
  });
}

export interface Achse {
  modus: 'monat' | 'tag';
  /** explizite Ticks (nur im Monatsmodus); undefined = Recharts wählt selbst */
  ticks: string[] | undefined;
  /** Beschriftung eines Ticks */
  format: (iso: string) => string;
}

/**
 * Achse für eine kategoriale Datumsreihe (täglich oder wöchentlich).
 * Mehr als ~120 Tage → ein Tick je Monat: der erste Datenpunkt eines Monats,
 * sofern er in dessen ersten sieben Tagen liegt (ein angebrochener Startmonat
 * wie „27. Juni" bekäme sonst ein Etikett direkt neben „Jul").
 * Spannt die Reihe mehrere Jahre, tragen Januar-Ticks das Jahr („Jan 27").
 */
export function zeitachse(daten: readonly string[], formatTag: (iso: string) => string): Achse {
  const erstes = daten[0];
  const letztes = daten[daten.length - 1];
  if (!erstes || !letztes || tageDiff(erstes, letztes) <= MONATSTICKS_AB_TAGEN) {
    return { modus: 'tag', ticks: undefined, format: formatTag };
  }
  const ticks: string[] = [];
  let letzterMonat = '';
  for (const d of daten) {
    const monat = d.slice(0, 7);
    if (monat === letzterMonat) continue;
    letzterMonat = monat;
    if (Number(d.slice(8, 10)) <= 7) ticks.push(d);
  }
  const mehrereJahre = erstes.slice(0, 4) !== letztes.slice(0, 4);
  return {
    modus: 'monat',
    ticks,
    format: (iso) => {
      const m = Number(iso.slice(5, 7)) - 1;
      return mehrereJahre && m === 0 ? `Jan ${iso.slice(2, 4)}` : MONATE[m] ?? iso;
    },
  };
}
