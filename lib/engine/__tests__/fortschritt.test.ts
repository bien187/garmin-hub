import { describe, it, expect, vi, afterEach } from 'vitest';
import { fortschrittBisHeute, trainingsstartAus, verlaufSeitTrainingsstart } from '../fortschritt';
import { addTage, heuteIso, tageDiff } from '@/lib/format';
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
  it('zeigt bei Trainingsstart vor vier Monaten alle Wochen ab der ersten',()=>{
    const heute='2026-11-04';
    const start='2026-07-04'; // Samstag, vier Monate zurück — mehr als 90 Tage
    const tage=[];
    for(let d=start;d<=heute;d=addTage(d,1)) tage.push({datum:d,paceRefHrSKm:360-tageDiff(start,d)/10,paceRefHrSekunden:600});
    const d=fortschrittBisHeute(tage,heute,start);
    // erste Woche = Montag der Startwoche, enthält den ersten Trainingstag
    expect(d.wochen[0]).toEqual({woche:'2026-06-29',bis:'2026-07-05',paceSKm:360});
    expect(d.wochen.at(-1)).toMatchObject({woche:'2026-11-02',bis:heute});
    // keine Woche fehlt: lückenlos im 7-Tage-Abstand, alle befüllt
    expect(d.wochen).toHaveLength(19);
    d.wochen.forEach((w,i)=>{
      expect(w.woche).toBe(addTage('2026-06-29',7*i));
      expect(w.paceSKm).not.toBeNull();
    });
    expect(d.letzteMessung).toBe(heute);
  });
  it('leitet den Trainingsstart aus den Zeilen ab statt aus einem 90-Tage-Fenster',()=>{
    const heute='2026-11-04';
    const start='2026-07-04';
    const rows=[];
    for(let d=start;d<=heute;d=addTage(d,1)) rows.push({datum:d,ctl:1,paceRefHrSKm:360,paceRefHrSekunden:600});
    const v=verlaufSeitTrainingsstart(rows,heute,start);
    expect(v.trainingsstart).toBe(start);
    expect(v.verlauf).toHaveLength(rows.length);
    expect(v.verlauf[0].datum).toBe(start);
    // erste Woche = Montag der Startwoche, nicht heute − 90 Tage
    expect(v.fortschritt.wochen[0].woche).toBe('2026-06-29');
    expect(v.fortschritt.wochen).toHaveLength(19);
  });
  it('ignoriert veraltete Zeilen vor der ersten nicht gelöschten Aktivität',()=>{
    const heute='2026-11-04';
    const rows=[];
    for(let d='2026-06-27';d<=heute;d=addTage(d,1)) rows.push({datum:d,paceRefHrSKm:null,paceRefHrSekunden:null});
    // erste Einheit (27.06.) gelöscht, nächste am 30.06. — 27.–29.06. sind Altlast
    const v=verlaufSeitTrainingsstart(rows,heute,'2026-06-30');
    expect(v.trainingsstart).toBe('2026-06-30');
    expect(v.verlauf[0].datum).toBe('2026-06-30');
    expect(v.fortschritt.wochen[0].woche).toBe('2026-06-29');
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
