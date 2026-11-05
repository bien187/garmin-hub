import type { Metadata } from "next";
import { DemoRahmen } from "@/components/demo/demo-rahmen";

export const metadata: Metadata = {
  title: { default: "Demo", template: "%s · Garmin Hub Demo" },
  description:
    "Öffentliche Demo von Garmin Hub: Trainings-Dashboard, Aktivitäten, Plan, Körper und Schlaf mit fiktiven Testdaten — ohne Login und ohne Garmin-Konto.",
  robots: { index: false, follow: false },
};

/**
 * Öffentliche Demo (ohne Login, siehe lib/oeffentliche-pfade.ts). Nutzt die
 * Seiten-Komponenten der App; Daten kommen ausschliesslich aus
 * public/demo/daten/ und werden im Browser beantwortet (lib/demo/api.ts).
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoRahmen>{children}</DemoRahmen>;
}
