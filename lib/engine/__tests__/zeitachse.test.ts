import { describe, expect, it } from 'vitest';
import { addTage } from '@/lib/format';
import {
  addMonate,
  filtereZeitraum,
  verfuegbareZeitraeume,
  zeitachse,
  zeitraumVon,
} from '../zeitachse';

const tageVon = (von: string, bis: string) => {
  const out: string[] = [];
  for (let d = von; d <= bis; d = addTage(d, 1)) out.push(d);
  return out;
};
const formatTag = (iso: string) => `T${iso}`;

describe('addMonate', () => {
  it('verschiebt um Monate und klemmt das Monatsende', () => {
    expect(addMonate('2026-11-04', -6)).toBe('2026-05-04');
    expect(addMonate('2026-08-31', -6)).toBe('2026-02-28');
    expect(addMonate('2028-08-31', -6)).toBe('2028-02-29');
    expect(addMonate('2026-02-15', -3)).toBe('2025-11-15');
    expect(addMonate('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('Zeitraum', () => {
  it('liefert die Untergrenze relativ zum letzten Datum', () => {
    expect(zeitraumVon('90t', '2026-11-04')).toBe('2026-08-06');
    expect(zeitraumVon('6m', '2026-11-04')).toBe('2026-05-04');
    expect(zeitraumVon('alles', '2026-11-04')).toBeNull();
  });

  it('filtert clientseitig auf den gelieferten Punkten', () => {
    const punkte = tageVon('2026-06-27', '2026-11-04').map((datum) => ({ datum }));
    expect(punkte).toHaveLength(131);
    expect(filtereZeitraum(punkte, (p) => p.datum, 'alles')).toHaveLength(131);
    const t90 = filtereZeitraum(punkte, (p) => p.datum, '90t');
    expect(t90[0].datum).toBe('2026-08-06');
    expect(t90.at(-1)?.datum).toBe('2026-11-04');
    expect(t90).toHaveLength(91);
    expect(filtereZeitraum([], (p: { datum: string }) => p.datum, '90t')).toEqual([]);
  });

  it('bietet nur Zeiträume an, die sich von „Alles" unterscheiden', () => {
    // echte Lage: Start 27.06., heute 04.11. → 6 Mon. wäre identisch mit Alles
    expect(verfuegbareZeitraeume('2026-06-27', '2026-11-04')).toEqual(['90t', 'alles']);
    expect(verfuegbareZeitraeume('2026-01-10', '2026-11-04')).toEqual(['90t', '6m', 'alles']);
    expect(verfuegbareZeitraeume('2026-09-01', '2026-11-04')).toEqual(['alles']);
    expect(verfuegbareZeitraeume(null, null)).toEqual(['alles']);
  });
});

describe('zeitachse', () => {
  it('bleibt bis 120 Tage bei Tagesticks', () => {
    const a = zeitachse(tageVon('2026-07-07', '2026-11-04'), formatTag); // 120 Tage
    expect(a.modus).toBe('tag');
    expect(a.ticks).toBeUndefined();
    expect(a.format('2026-08-01')).toBe('T2026-08-01');
  });

  it('setzt ab mehr als 120 Tagen Monatsticks mit deutschen Kürzeln', () => {
    const a = zeitachse(tageVon('2026-06-27', '2026-11-04'), formatTag);
    expect(a.modus).toBe('monat');
    // angebrochener Startmonat (27. Juni) bekommt keinen eigenen Tick
    expect(a.ticks).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
    expect(a.ticks!.map(a.format)).toEqual(['Jul', 'Aug', 'Sep', 'Okt', 'Nov']);
    expect(a.format('2026-03-01')).toBe('Mär');
  });

  it('setzt bei Wochenpunkten den ersten Punkt jedes Monats als Tick', () => {
    const sonntage: string[] = [];
    for (let d = '2026-06-28'; d <= '2026-11-01'; d = addTage(d, 7)) sonntage.push(d);
    sonntage.push('2026-11-04'); // laufende Woche bis heute
    const a = zeitachse(sonntage, formatTag);
    expect(a.ticks).toEqual(['2026-07-05', '2026-08-02', '2026-09-06', '2026-10-04', '2026-11-01']);
  });

  it('zeigt bei Jahreswechsel das Jahr am Januar-Tick', () => {
    const a = zeitachse(tageVon('2026-10-01', '2027-03-01'), formatTag);
    expect(a.ticks!.map(a.format)).toEqual(['Okt', 'Nov', 'Dez', 'Jan 27', 'Feb', 'Mär']);
  });
});
