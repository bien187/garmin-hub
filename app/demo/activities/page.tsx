import { ActivityList } from "@/components/activities/activity-list";

export const metadata = { title: "Aktivitäten" };

export default function DemoAktivitaeten() {
  return (
    <div className="mx-auto max-w-3xl">
      <ActivityList />
    </div>
  );
}
