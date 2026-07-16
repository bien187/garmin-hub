import { GarminCard } from "@/components/settings/garmin-card";

export const metadata = { title: "Garmin-Verbindung" };

/** Dedizierte Setup-Seite für den MFA-Fall (§3.1) */
export default function GarminSettingsPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <h1 className="stat-display text-2xl uppercase tracking-wide">
        Garmin-Verbindung
      </h1>
      <GarminCard />
    </div>
  );
}
