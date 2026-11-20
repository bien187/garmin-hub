import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekView } from "@/components/plan/week-view";
import { WorkoutGenerator } from "@/components/plan/workout-generator";

export const PLAN_TABS = ["woche", "generator"] as const;

/** Tab-Wert aus `?tab=` prüfen (unbekannt → Woche) */
export function planStartTab(tab: string | undefined): string {
  return PLAN_TABS.includes(tab as (typeof PLAN_TABS)[number]) ? (tab as string) : "woche";
}

/** Plan-Seite (Wochenplan und Workout-Generator) — regulär und in der Demo */
export function PlanAnsicht({ start }: { start: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-3 pb-6 md:px-6 md:pt-6">
      <Tabs defaultValue={start}>
        <TabsList className="h-11! w-full rounded-full! bg-surface p-1">
          <TabsTrigger
            value="woche"
            className="min-h-9 flex-1 rounded-full! data-active:bg-primary! data-active:text-primary-foreground!"
          >
            Wochenplan
          </TabsTrigger>
          <TabsTrigger
            value="generator"
            className="min-h-9 flex-1 rounded-full! data-active:bg-primary! data-active:text-primary-foreground!"
          >
            Freies Workout
          </TabsTrigger>
        </TabsList>
        <TabsContent value="woche" className="mt-4">
          <WeekView />
        </TabsContent>
        <TabsContent value="generator" className="mt-4">
          <WorkoutGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
