import { notFound } from "next/navigation";
import { SchlafDetailAnsicht } from "@/components/schlaf/schlaf-detail";
import { DEMO_HEUTE } from "@/lib/demo/konstanten";

export const metadata = { title: "Schlaf" };

export default async function DemoSchlaf({ params }: { params: Promise<{ datum: string }> }) {
  const { datum } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) notFound();
  return <SchlafDetailAnsicht datum={datum} heute={DEMO_HEUTE} />;
}
