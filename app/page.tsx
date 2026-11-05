import { Suspense } from "react";
import { SyncButton } from "@/components/dashboard/sync-button";
import { SchlafKachel, SchlafKachelSkeleton } from "@/components/dashboard/schlaf-kachel";
import { DashboardAktuell } from "@/components/dashboard/dashboard-aktuell";
import { DashboardAnsicht } from "@/components/dashboard/dashboard-ansicht";
import { ladeDashboard } from "@/lib/server/dashboard-service";
import { heuteIso } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DashboardPage() {
  const d = await ladeDashboard();
  const heute = heuteIso();
  return (
    <DashboardAnsicht
      d={d}
      heute={heute}
      aktualisierer={<DashboardAktuell />}
      kopfAktion={<SyncButton kompakt />}
      schlafKachel={
        <Suspense fallback={<SchlafKachelSkeleton />}>
          <SchlafKachel heute={heute} />
        </Suspense>
      }
    />
  );
}
