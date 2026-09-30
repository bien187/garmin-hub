import { describe,it,expect } from 'vitest';
import { generiereWochenplan, type PlanInput } from '../plan';
import { planeVerfuegbarkeit, istGymTag } from '../verfuegbarkeit';
const basis:PlanInput={wochenstart:'2026-09-28',phaseNr:2,restwochen:7,wochenIndex:8,vorwocheLaufMin:180,tsb:0,acwr:1,muscleState:{},benchmarks:{},readiness:70,paces:null,zonen:{z2:{von:137,bis:152},z4:{von:168,bis:183},z5:{von:183,bis:197}},letztesLastKg:8};
const plan=()=>generiereWochenplan(basis);
describe('Training nach Terminplan',()=>{
  it('erhält alle Gym-Einheiten und sperrt flexible Tage vollständig',()=>{
    const p=plan();const neu=planeVerfuegbarkeit(p,['2026-09-29'],basis.wochenstart);
    expect(neu.einheiten.filter(e=>e.datum==='2026-09-29').every(e=>e.typ==='ruhe')).toBe(true);
    expect(neu.einheiten.filter(e=>istGymTag(e.datum))).toEqual(p.einheiten.filter(e=>istGymTag(e.datum)));
    expect(neu.einheiten.some(e=>e.typ==='huegel_intervalle' && e.datum==='2026-09-30')).toBe(true);
  });
  it('legt höchstens einen Lauf pro Tag und keine harten Einheiten an aufeinanderfolgenden Tagen',()=>{
    const neu=planeVerfuegbarkeit(plan(),['2026-09-29','2026-10-03'],basis.wochenstart);
    const runs=neu.einheiten.filter(e=>e.struktur?.sport==='laufen');
    expect(new Set(runs.map(e=>e.datum)).size).toBe(runs.length);
    expect(runs.every(e=>!istGymTag(e.datum))).toBe(true);
    expect(neu.hinweise.some(h=>h.includes('entfällt'))).toBe(true);
  });
  it('behält bei allen gesperrten freien Tagen nur Gym und Ruhe',()=>{
    const neu=planeVerfuegbarkeit(plan(),['2026-09-29','2026-09-30','2026-10-02','2026-10-03'],basis.wochenstart);
    expect(neu.einheiten.filter(e=>!istGymTag(e.datum)).every(e=>e.typ==='ruhe')).toBe(true);
  });
  it('lässt vergangene und bereits belegte Tage bei Neugenerierung aus',()=>{
    const neu=planeVerfuegbarkeit(plan(),['2026-10-03'],'2026-09-30',['2026-10-02']);
    expect(neu.einheiten.every(e=>e.datum>='2026-09-30' && e.datum!=='2026-10-02')).toBe(true);
  });
  it('stellt beim Freigeben den regulären Wochenplan wieder her',()=>{
    expect(planeVerfuegbarkeit(plan(),[],basis.wochenstart).einheiten).toEqual(plan().einheiten);
  });
  it('überschreibt keine regenerationsbedingt geplanten Ruhetage',()=>{
    const p=generiereWochenplan({...basis,tsb:-25});
    const neu=planeVerfuegbarkeit(p,['2026-10-03'],basis.wochenstart);
    expect(neu.einheiten.filter(e=>e.datum==='2026-10-02').every(e=>e.typ==='ruhe')).toBe(true);
  });
});


describe('Belastungsgrenzen bei Neuplanung', () => {
  it('beachtet harte Einheiten auf bereits geschützten Tagen', () => {
    const neu = planeVerfuegbarkeit(plan(), ['2026-10-03'], basis.wochenstart, ['2026-09-29'], ['2026-09-29']);
    expect(neu.einheiten.filter(e => e.typ === 'lastlauf').every(e => e.datum !== '2026-09-30')).toBe(true);
  });
  it('zieht bei müden Beinen harte Einheiten nicht vor den frühesten erlaubten Tag', () => {
    const neu = planeVerfuegbarkeit(plan(), ['2026-09-30', '2026-10-03'], basis.wochenstart, [], [], '2026-09-30');
    expect(neu.einheiten.filter(e => ['huegel_intervalle', 'lastlauf'].includes(e.typ)).every(e => e.datum >= '2026-09-30')).toBe(true);
  });
  it('erhöht bei keiner Kombination gesperrter Tage die Gesamtbelastung', () => {
    const frei = ['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03'];
    const p = plan();
    const summe = (einheiten: typeof p.einheiten) => einheiten.reduce((sum, e) => sum + (e.erwarteterTrimp ?? 0), 0);
    for (let mask = 0; mask < 16; mask++) {
      const gesperrt = frei.filter((_, i) => mask & (1 << i));
      const neu = planeVerfuegbarkeit(p, gesperrt, basis.wochenstart);
      expect(summe(neu.einheiten)).toBeLessThanOrEqual(summe(p.einheiten));
      expect(neu.einheiten.filter(e => gesperrt.includes(e.datum)).every(e => e.typ === 'ruhe')).toBe(true);
    }
  });
});
