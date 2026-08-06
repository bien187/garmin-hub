import { BodyTab } from "@/components/body/body-tab";

export const metadata = { title: "Körper" };

export default function BodyPage() {
  // Kein h1/Intro (dupliziert das Tab-Label) — die Body-Map ist das
  // Hero-Element und beginnt direkt unter der Safe Area.
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-2 pb-4 md:px-6">
      <BodyTab />
    </div>
  );
}
