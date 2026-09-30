import { describe, it, expect, vi, afterEach } from 'vitest';
import { fortschrittBisHeute } from '../fortschritt';
import { heuteIso } from '@/lib/format';
afterEach(()=>vi.useRealTimers());
describe('Fortschritt bis heute',()=>{
  it('zeigt die laufende Woche bis heute mit dem neuesten Messwert',()=>{
    const d=fortschrittBisHeute([{datum:'2026-09-30',paceRefHrSKm:330,paceRefHrSekunden:600}], '2026-09-30','2026-09-01');
    expect(d.wochen.at(-1)).toEqual({woche:'2026-09-28',bis:'2026-09-30',paceSKm:330});
    expect(d.letzteMessung).toBe('2026-09-30');
  });
  it('füllt fehlende Wochen nicht mit erfundenen Messungen und ignoriert die Zukunft',()=>{
    const d=fortschrittBisHeute([{datum:'2026-09-21',paceRefHrSKm:350,paceRefHrSekunden:600},{datum:'2026-10-01',paceRefHrSKm:300,paceRefHrSekunden:600}], '2026-09-30','2026-09-01');
    expect(d.wochen.at(-1)?.paceSKm).toBeNull();
    expect(d.wochen.at(-1)?.bis).toBe('2026-09-30');
    expect(d.letzteMessung).toBe('2026-09-21');
  });
  it('verwendet das Schweizer Tagesdatum auch wenn der Server noch gestern hat',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T22:30:00Z'));
    expect(heuteIso()).toBe('2026-09-30');
  });
});
