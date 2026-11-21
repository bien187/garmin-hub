import { describe, it, expect, vi, afterEach } from 'vitest';
import { trainingsstartAus, verlaufSeitTrainingsstart } from '../fortschritt';
import { addTage, heuteIso } from '@/lib/format';
afterEach(()=>vi.useRealTimers());
describe('Verlauf seit Trainingsstart',()=>{
  it('leitet den Trainingsstart aus den Zeilen ab statt aus einem 90-Tage-Fenster',()=>{
    const heute='2026-11-04';
    const start='2026-07-04';
    const rows=[];
    for(let d=start;d<=heute;d=addTage(d,1)) rows.push({datum:d,ctl:1});
    const v=verlaufSeitTrainingsstart(rows,heute,start);
    expect(v.trainingsstart).toBe(start);
    expect(v.verlauf).toHaveLength(rows.length);
    expect(v.verlauf[0].datum).toBe(start);
    expect(v.verlauf.at(-1)?.datum).toBe(heute);
  });
  it('ignoriert veraltete Zeilen vor der ersten nicht gelöschten Aktivität',()=>{
    const heute='2026-11-04';
    const rows=[];
    for(let d='2026-06-27';d<=heute;d=addTage(d,1)) rows.push({datum:d});
    // erste Einheit (27.06.) gelöscht, nächste am 30.06. — 27.–29.06. sind Altlast
    const v=verlaufSeitTrainingsstart(rows,heute,'2026-06-30');
    expect(v.trainingsstart).toBe('2026-06-30');
    expect(v.verlauf[0].datum).toBe('2026-06-30');
  });
  it('wählt den späteren von erster Zeile und erster Aktivität',()=>{
    expect(trainingsstartAus('2026-06-27','2026-06-30')).toBe('2026-06-30');
    expect(trainingsstartAus('2026-06-27','2026-06-20')).toBe('2026-06-27');
    expect(trainingsstartAus(null,'2026-06-20')).toBe('2026-06-20');
    expect(trainingsstartAus('2026-06-27',null)).toBe('2026-06-27');
    expect(trainingsstartAus(undefined,null)).toBeNull();
    expect(verlaufSeitTrainingsstart([],'2026-11-04',null).verlauf).toEqual([]);
  });
  it('verwendet das Schweizer Tagesdatum auch wenn der Server noch gestern hat',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T22:30:00Z'));
    expect(heuteIso()).toBe('2026-09-30');
  });
});
