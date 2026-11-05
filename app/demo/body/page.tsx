import { BodyTab } from "@/components/body/body-tab";

export const metadata = { title: "Körper" };

export default function DemoKoerper() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-2 pb-4 md:px-6">
      <BodyTab />
    </div>
  );
}
