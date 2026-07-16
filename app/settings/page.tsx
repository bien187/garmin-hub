import { GarminCard } from "@/components/settings/garmin-card";
import { ProfileForm } from "@/components/settings/profile-form";
import { LogoutButton } from "@/components/settings/logout-button";

export const metadata = { title: "Einstellungen" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="stat-display text-2xl uppercase tracking-wide">
          Einstellungen
        </h1>
        <LogoutButton />
      </div>
      <GarminCard />
      <ProfileForm />
      <p className="text-xs text-muted-foreground">
        Garmin Hub nutzt die inoffizielle Garmin-Connect-API — Nutzung auf
        eigenes Risiko, nur für den persönlichen Account. Details im README.
      </p>
    </div>
  );
}
