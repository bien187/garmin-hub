import { ActivityDetail } from "@/components/activities/detail/activity-detail";

export const metadata = { title: "Aktivität" };

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ActivityDetail id={id} />;
}
