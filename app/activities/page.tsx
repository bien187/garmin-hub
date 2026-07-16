import { ActivityList } from "@/components/activities/activity-list";

export const metadata = { title: "Aktivitäten" };

export default function ActivitiesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <h1 className="stat-display text-2xl uppercase tracking-wide">Aktivitäten</h1>
      <ActivityList />
    </div>
  );
}
