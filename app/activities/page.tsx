import { ActivityList } from "@/components/activities/activity-list";

export const metadata = { title: "Aktivitäten" };

export default function ActivitiesPage() {
  // Kein Seiten-Padding — die Liste bringt Kopf, Filter und Ränder mit.
  return (
    <div className="mx-auto max-w-3xl">
      <ActivityList />
    </div>
  );
}
