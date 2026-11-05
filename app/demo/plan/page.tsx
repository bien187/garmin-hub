import { PlanAnsicht, planStartTab } from "@/components/plan/plan-ansicht";

export const metadata = { title: "Plan" };

export default async function DemoPlan({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <PlanAnsicht start={planStartTab(tab)} />;
}
