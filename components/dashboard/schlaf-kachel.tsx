import { ladeSchlafDetail, letzteSchlafNacht } from "@/lib/server/sleep-service";
import { SchlafKachelAnsicht } from "./schlaf-kachel-ansicht";

export { SchlafKachelSkeleton } from "./schlaf-kachel-ansicht";

/** Dashboard-Kachel: letzte Nacht (Aufwachdatum ≤ heute), ganze Kachel verlinkt auf die Detailansicht */
export async function SchlafKachel({ heute }: { heute: string }) {
  let datum: string | null = null;
  let detail: Awaited<ReturnType<typeof ladeSchlafDetail>> = null;
  try {
    datum = await letzteSchlafNacht(heute);
    detail = datum ? await ladeSchlafDetail(datum) : null;
  } catch {
    detail = null; // kein Fehlerschreck: Leerzustand
  }
  return <SchlafKachelAnsicht detail={detail} heute={heute} />;
}

