import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekView } from "@/components/plan/week-view";
import { WorkoutGenerator } from "@/components/plan/workout-generator";

export const PLAN_TABS = ["woche", "generator"] as const;

/** Ruhige Unterstrich-Tabs statt gefüllter Segmente */
const TAB =
  "-mb-px h-10 flex-none rounded-none! border-0 border-b-2 border-transparent bg-transparent! px-0 text-sm font-normal text-muted-foreground shadow-none! data-active:border-primary! data-active:bg-transparent! data-active:text-foreground! dark:data-active:border-primary! dark:data-active:bg-transparent!";

/** Tab-Wert aus `?tab=` prüfen (unbekannt → Woche) */
export function planStartTab(tab: string | undefined): string {
  return PLAN_TABS.includes(tab as (typeof PLAN_TABS)[number]) ? (tab as string) : "woche";
}

/** Plan-Seite (Wochenplan und Workout-Generator) — regulär und in der Demo */
export function PlanAnsicht({ start }: { start: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-8 md:px-8 md:pt-8">
      <h1 className="text-[24px] leading-tight font-medium tracking-tight md:text-[28px]">Plan</h1>
      <Tabs defaultValue={start}>
        <TabsList className="h-10! w-full justify-start gap-6 rounded-none! border-b border-border bg-transparent! p-0">
          <TabsTrigger value="woche" className={TAB}>
            Wochenplan
          </TabsTrigger>
          <TabsTrigger value="generator" className={TAB}>
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
