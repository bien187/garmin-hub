import { addTage, montagVon } from '@/lib/format';
import { fasseZusammen } from './pace-bei-hr';
export interface PaceWoche { woche: string; bis: string; paceSKm: number | null }
export function fortschrittBisHeute(tage: {datum:string; paceRefHrSKm:number|null; paceRefHrSekunden:number|null}[], heute:string, seit:string) {
  const aktuell = tage.filter(t => t.datum >= seit && t.datum <= heute && t.paceRefHrSKm != null);
  const wochen: PaceWoche[] = [];
  for (let woche=montagVon(seit); woche<=heute; woche=addTage(woche,7)) {
    const ende=addTage(woche,6);
    const bis=ende>heute?heute:ende;
    const werte=aktuell.filter(t=>t.datum>=woche && t.datum<=bis)
      .map(t=>({paceSKm:t.paceRefHrSKm!,sekunden:t.paceRefHrSekunden??60}));
    const pace=fasseZusammen(werte);
    wochen.push({woche,bis,paceSKm:pace?Math.round(pace.paceSKm):null});
  }
  return {wochen, letzteMessung:aktuell.map(t=>t.datum).sort().at(-1)??null};
}
