import { addTage, tageDiff } from '@/lib/format';
import type { PlanEinheit, Wochenplan } from './plan';

export const GYM_TAGE = [0, 3, 6]; // Montag, Donnerstag, Sonntag
export function istGymTag(datum: string): boolean {
  return GYM_TAGE.includes((new Date(datum + 'T12:00:00').getDay() + 6) % 7);
}
const lauf = (e: PlanEinheit) => ['lauf_z2', 'intervalle', 'huegel_intervalle', 'lastlauf', 'langer_lauf', 'probe_ep'].includes(e.typ);
const hart = (e: PlanEinheit) => lauf(e) && e.typ !== 'lauf_z2';

/** Verteilt flexible Einheiten ohne zusätzliche Läufe oder höhere Belastung. */
export function planeVerfuegbarkeit(plan: Wochenplan, gesperrt: string[], ab: string, belegt: string[] = [], festeHarteTage: string[] = [], harteTageAb = plan.wochenstart): Wochenplan {
  const sperren = new Set(gesperrt.filter(d => !istGymTag(d)));
  const fix = new Set(belegt);
  const einheiten = plan.einheiten.filter(e => e.datum >= ab && !fix.has(e.datum));
  if (!sperren.size) return { ...plan, einheiten };
  const hinweise = [...plan.hinweise.filter(h => !h.includes('Samstag'))];
  const ruhetage = new Set(einheiten.filter(e => e.typ === 'ruhe').map(e => e.datum));
  const tage = Array.from({length: 7}, (_, i) => addTage(plan.wochenstart, i))
    .filter(d => d >= ab && !sperren.has(d) && !fix.has(d) && !istGymTag(d) && !ruhetage.has(d));
  const neu = einheiten.filter(e => !lauf(e) && !sperren.has(e.datum));
  const laeufe = einheiten.filter(lauf).sort((a,b) => {
    const rang = (e: PlanEinheit) => ['lastlauf','probe_ep','langer_lauf'].includes(e.typ) ? 0 : hart(e) ? 1 : 2;
    return rang(a) - rang(b) || a.datum.localeCompare(b.datum);
  });
  const verteilt: PlanEinheit[] = [];
  for (const e of laeufe) {
    const ziel = [...tage].sort((a,b) => Math.abs(tageDiff(e.datum,a)) - Math.abs(tageDiff(e.datum,b)) || a.localeCompare(b))
      .find(d => !(hart(e) && d < harteTageAb) && !(hart(e) && festeHarteTage.some(f => Math.abs(tageDiff(f,d)) < 2)) && !verteilt.some(v => v.datum === d || (hart(e) && hart(v) && Math.abs(tageDiff(v.datum,d)) < 2)));
    if (ziel) {
      verteilt.push({ ...e, datum: ziel });
      if (ziel !== e.datum) hinweise.push(e.titel + ': von ' + e.datum + ' auf ' + ziel + ' verschoben.');
    } else hinweise.push(e.titel + ' entfällt diese Woche: kein freier Trainingstag mit ausreichendem Abstand.');
  }
  neu.push(...verteilt);
  for (const e of einheiten.filter(e => !lauf(e) && e.typ !== 'ruhe' && sperren.has(e.datum))) {
    const ziel = tage.find(d => !neu.some(v => v.datum === d && v.typ === e.typ));
    if (ziel) neu.push({ ...e, datum: ziel });
    else hinweise.push(e.titel + ' entfällt wegen deiner Termine.');
  }
  for (const datum of sperren) {
    if (datum < ab || datum < plan.wochenstart || datum > addTage(plan.wochenstart,6) || fix.has(datum)) continue;
    neu.push({datum, typ:'ruhe', titel:'Kein Training möglich', beschreibung:'Durch deinen Terminplan gesperrt.', erwarteterTrimp:0});
  }
  hinweise.push('Deine gesperrten Tage gelten auch für Grease the Groove. Gymtage bleiben fix; fehlende Einheiten werden nicht zusätzlich auf Gymtage gepackt.');
  return {...plan, einheiten: neu.sort((a,b) => a.datum.localeCompare(b.datum)), hinweise};
}
