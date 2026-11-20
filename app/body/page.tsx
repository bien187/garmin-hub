import { BodyTab } from "@/components/body/body-tab";

export const metadata = { title: "Körper" };

export default function BodyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-6 md:px-6 md:pt-6">
      <BodyTab />
    </div>
  );
}
