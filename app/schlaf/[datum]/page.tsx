import { notFound } from "next/navigation";
import { SchlafDetailAnsicht } from "@/components/schlaf/schlaf-detail";
import { heuteIso } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Schlaf-Detailansicht einer Nacht (Datum = Aufwachdatum). Daten lädt die Client-Komponente kartenweise. */
export default async function SchlafSeite({ params }: { params: Promise<{ datum: string }> }) {
  const { datum } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) notFound();
  return <SchlafDetailAnsicht datum={datum} heute={heuteIso()} />;
}
