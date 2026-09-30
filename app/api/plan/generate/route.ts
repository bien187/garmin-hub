import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generiereUndSpeichereWoche } from '@/lib/server/plan-service';
import { addTage, heuteIso, montagVon } from '@/lib/format';
import { istGymTag } from '@/lib/engine/verfuegbarkeit';

export const maxDuration = 60;
const schema = z.object({wochenstart:z.iso.date().optional(), nichtVerfuegbar:z.array(z.iso.date()).max(7).optional()});
export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({error:'Ungültige Planungsdaten.'},{status:400});
  const montag = montagVon(body.data.wochenstart ?? heuteIso());
  const sperren = body.data.nichtVerfuegbar;
  if (sperren?.some(d => d < montag || d > addTage(montag,6) || istGymTag(d))) {
    return NextResponse.json({error:'Nur freie Tage dieser Woche können gesperrt werden.'},{status:400});
  }
  try {
    const plan = await generiereUndSpeichereWoche(montag, sperren);
    return NextResponse.json({ok:true, plan});
  } catch (e) {
    const bekannt = e instanceof Error && e.message.startsWith('Bitte die Einheiten');
    return NextResponse.json({error: bekannt ? (e as Error).message : 'Plan konnte nicht gespeichert werden. Bitte erneut versuchen.'},{status:bekannt ? 409 : 500});
  }
}
