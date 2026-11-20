import { describe, it, expect } from 'vitest';
import { generiereWochenplan, type PlanInput } from '../plan';
import { planeVerfuegbarkeit, istGymTag, istSperrbar, wochentagIndex } from '../verfuegbarkeit';
import { istLaufTyp } from '../plan-typen';

// Mo 30.11.2026 · Di 01.12. · Mi 02.12. · Do 03.12. · Fr 04.12. · Sa 05.12. · So 06.12.
const basis: PlanInput = {
  wochenstart: '2026-11-30',
  blockWoche: 2,
  vorwocheLaufMin: 120,
  tsb: 0,
  acwr: 1,
  muscleState: {},
  klimmzugMax: 8,
  readiness: 70,
  paces: null,
  zonen: { z2: { von: 137, bis: 152 }, z4: { von: 168, bis: 183 }, z5: { von: 183, bis: 197 } },
};
const plan = () => generiereWochenplan(basis);
const DI = '2026-12-01';
const MI = '2026-12-02';

describe('Wochentage', () => {
  it('Mo/Do sind Gymtage, nur Di/Mi lassen sich sperren', () => {
    expect(wochentagIndex('2026-11-30')).toBe(0);
    expect(istGymTag('2026-11-30')).toBe(true);
    expect(istGymTag('2026-12-03')).toBe(true);
    expect(['2026-11-30', DI, MI, '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'].map(istSperrbar))
      .toEqual([false, true, true, false, false, false, false]);
  });
});

describe('Training nach Terminplan', () => {
  it('Di gesperrt → Intervalle wandern auf Mi, der lockere Lauf entfällt', () => {
    const neu = planeVerfuegbarkeit(plan(), [DI], basis.wochenstart);
    expect(neu.einheiten.filter(e => e.datum === DI).every(e => e.typ === 'ruhe')).toBe(true);
    expect(neu.einheiten.some(e => e.typ === 'huegel_intervalle' && e.datum === MI)).toBe(true);
    expect(neu.einheiten.some(e => e.typ === 'lauf_z2')).toBe(false);
    expect(neu.hinweise.some(h => h.includes('entfällt'))).toBe(true);
  });

  it('erhält alle Gym-Einheiten, Ruhetag und freies Wochenende', () => {
    const p = plan();
    const neu = planeVerfuegbarkeit(p, [DI, MI], basis.wochenstart);
    expect(neu.einheiten.filter(e => istGymTag(e.datum))).toEqual(p.einheiten.filter(e => istGymTag(e.datum)));
    expect(neu.einheiten.filter(e => e.datum === '2026-12-04').map(e => e.typ)).toEqual(['ruhe']);
    expect(neu.einheiten.some(e => e.datum >= '2026-12-05')).toBe(false);
  });

  it('verschiebt nie einen Lauf auf Fr, Sa oder So', () => {
    for (const gesperrt of [[DI], [MI], [DI, MI]]) {
      const neu = planeVerfuegbarkeit(plan(), gesperrt, basis.wochenstart);
      expect(neu.einheiten.filter(e => istLaufTyp(e.typ)).every(e => e.datum === DI || e.datum === MI)).toBe(true);
    }
  });

  it('Sperren von Gym-, Ruhe- oder Wochenendtagen wird ignoriert', () => {
    const p = plan();
    expect(planeVerfuegbarkeit(p, ['2026-11-30', '2026-12-04', '2026-12-05'], basis.wochenstart).einheiten).toEqual(p.einheiten);
  });

  it('lässt vergangene und bereits belegte Tage bei Neugenerierung aus', () => {
    const neu = planeVerfuegbarkeit(plan(), [MI], DI, ['2026-12-03']);
    expect(neu.einheiten.every(e => e.datum >= DI && e.datum !== '2026-12-03')).toBe(true);
  });

  it('stellt beim Freigeben den regulären Wochenplan wieder her', () => {
    expect(planeVerfuegbarkeit(plan(), [], basis.wochenstart).einheiten).toEqual(plan().einheiten);
  });
});

describe('Belastungsgrenzen bei Neuplanung', () => {
  it('zieht bei müden Beinen harte Einheiten nicht vor den frühesten erlaubten Tag', () => {
    const neu = planeVerfuegbarkeit(plan(), [MI], basis.wochenstart, [], [], MI);
    expect(neu.einheiten.some(e => e.typ === 'huegel_intervalle')).toBe(false);
  });

  it('erhöht bei keiner Kombination gesperrter Tage die Gesamtbelastung', () => {
    const p = plan();
    const summe = (einheiten: typeof p.einheiten) => einheiten.reduce((sum, e) => sum + (e.erwarteterTrimp ?? 0), 0);
    for (const gesperrt of [[], [DI], [MI], [DI, MI]]) {
      const neu = planeVerfuegbarkeit(p, gesperrt, basis.wochenstart);
      expect(summe(neu.einheiten)).toBeLessThanOrEqual(summe(p.einheiten));
      expect(neu.einheiten.filter(e => gesperrt.includes(e.datum)).every(e => e.typ === 'ruhe')).toBe(true);
    }
  });
});
