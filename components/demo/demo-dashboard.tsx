"use client";

import { DashboardAnsicht } from "@/components/dashboard/dashboard-ansicht";
import { SchlafKachelAnsicht } from "@/components/dashboard/schlaf-kachel-ansicht";
import { useDemo } from "./demo-rahmen";

/**
 * Dashboard der Demo: gleiche Ansicht wie die App, Daten aus dem fiktiven
 * Snapshot. Kein Sync-Knopf (in der Demo gibt es keine Garmin-Verbindung).
 */
export function DemoDashboard() {
  const { kern } = useDemo();
  return (
    <DashboardAnsicht
      d={kern.dashboard}
      heute={kern.heute}
      schlafKachel={<SchlafKachelAnsicht detail={kern.schlafKachel} heute={kern.heute} />}
    />
  );
}
