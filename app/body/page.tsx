import { BodyTab } from "@/components/body/body-tab";

export const metadata = { title: "Körper" };

export default function BodyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="stat-display text-2xl uppercase tracking-wide">Körper</h1>
        <p className="text-sm text-muted-foreground">
          Live-Muskelstatus über Kraft- und Ausdauertraining hinweg. Tippe auf
          eine Muskelgruppe.
        </p>
      </div>
      <BodyTab />
    </div>
  );
}
