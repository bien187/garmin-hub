import { PlanAnsicht, planStartTab } from "@/components/plan/plan-ansicht";

export const metadata = { title: "Plan" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // ?tab=generator öffnet direkt den Workout-Generator
  const { tab } = await searchParams;
  // Kein h1 (dupliziert das Tab-Label); die Tabs-Zeile ist der Kopf.
  return <PlanAnsicht start={planStartTab(tab)} />;
}
