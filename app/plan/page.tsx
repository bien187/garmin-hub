import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekView } from "@/components/plan/week-view";
import { WorkoutGenerator } from "@/components/plan/workout-generator";
import { BenchmarkForm } from "@/components/plan/benchmark-form";
import { ProbeEp } from "@/components/plan/probe-ep";
import { BenchmarkListe } from "@/components/plan/benchmark-liste";

export const metadata = { title: "Plan" };

export default function PlanPage() {
  // Kein h1 (dupliziert das Tab-Label); die Tabs-Zeile ist der Kopf.
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-2 pb-4 md:px-6">
      <Tabs defaultValue="woche">
        <TabsList className="w-full">
          <TabsTrigger value="woche" className="min-h-10 flex-1">
            Woche
          </TabsTrigger>
          <TabsTrigger value="generator" className="min-h-10 flex-1">
            Generator
          </TabsTrigger>
          <TabsTrigger value="benchmarks" className="min-h-10 flex-1">
            Benchmarks
          </TabsTrigger>
          <TabsTrigger value="probe" className="min-h-10 flex-1">
            Probe-EP
          </TabsTrigger>
        </TabsList>
        <TabsContent value="woche" className="mt-4">
          <WeekView />
        </TabsContent>
        <TabsContent value="generator" className="mt-4">
          <WorkoutGenerator />
        </TabsContent>
        <TabsContent value="benchmarks" className="mt-4 space-y-6">
          <BenchmarkForm />
          <BenchmarkListe />
        </TabsContent>
        <TabsContent value="probe" className="mt-4">
          <ProbeEp />
        </TabsContent>
      </Tabs>
    </div>
  );
}
