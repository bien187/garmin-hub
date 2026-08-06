import { ActivityList } from "@/components/activities/activity-list";

export const metadata = { title: "Aktivitäten" };

export default function ActivitiesPage() {
  // Kein h1 (dupliziert das Tab-Label) und kein Seiten-Padding — die Liste
  // bringt ihre eigenen 16px-Ränder und die Filterzeile als Kopf mit.
  return (
    <div className="mx-auto max-w-3xl">
      <ActivityList />
    </div>
  );
}
