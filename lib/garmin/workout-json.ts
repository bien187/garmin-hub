import { WorkoutSchritt, WorkoutStruktur } from "./workout-types";

/**
 * Übersetzt die interne Workout-Struktur in das JSON des inoffiziellen
 * Garmin-Workout-Service (POST /workout-service/workout).
 *
 * IDs aus dem Connect-Web-Client:
 *  stepType: 1 warmup · 2 cooldown · 3 interval · 4 recovery · 5 rest · 6 repeat
 *  endCondition: 1 lap.button · 2 time (s) · 3 distance (m) · 7 iterations
 *  targetType: 1 no.target · 4 heart.rate.zone · 6 pace.zone (m/s)
 */

const STEP_TYPE: Record<string, { stepTypeId: number; stepTypeKey: string }> = {
  aufwaermen: { stepTypeId: 1, stepTypeKey: "warmup" },
  auslaufen: { stepTypeId: 2, stepTypeKey: "cooldown" },
  intervall: { stepTypeId: 3, stepTypeKey: "interval" },
  erholung: { stepTypeId: 4, stepTypeKey: "recovery" },
  wiederholung: { stepTypeId: 6, stepTypeKey: "repeat" },
};

type GarminStep = Record<string, unknown>;

function schrittZuGarmin(s: WorkoutSchritt, zaehler: { n: number }): GarminStep {
  zaehler.n += 1;
  const order = zaehler.n;

  if (s.art === "wiederholung") {
    const kinder = (s.schritte ?? []).map((k) => schrittZuGarmin(k, zaehler));
    return {
      type: "RepeatGroupDTO",
      stepOrder: order,
      stepType: STEP_TYPE.wiederholung,
      numberOfIterations: s.wiederholungen ?? 1,
      smartRepeat: false,
      endCondition: { conditionTypeId: 7, conditionTypeKey: "iterations" },
      workoutSteps: kinder,
    };
  }

  const step: GarminStep = {
    type: "ExecutableStepDTO",
    stepOrder: order,
    stepType: STEP_TYPE[s.art] ?? STEP_TYPE.intervall,
    description: s.notiz ?? null,
  };

  if (s.dauerTyp === "zeit" && s.dauerWert) {
    step.endCondition = { conditionTypeId: 2, conditionTypeKey: "time" };
    step.endConditionValue = s.dauerWert;
  } else if (s.dauerTyp === "distanz" && s.dauerWert) {
    step.endCondition = { conditionTypeId: 3, conditionTypeKey: "distance" };
    step.endConditionValue = s.dauerWert;
  } else {
    step.endCondition = { conditionTypeId: 1, conditionTypeKey: "lap.button" };
  }

  if (s.ziel?.typ === "pace") {
    // Garmin erwartet m/s; targetValueOne = langsame Grenze, Two = schnelle
    step.targetType = { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone" };
    step.targetValueOne = 1000 / s.ziel.vonSproKm;
    step.targetValueTwo = 1000 / s.ziel.bisSproKm;
  } else if (s.ziel?.typ === "hr") {
    step.targetType = {
      workoutTargetTypeId: 4,
      workoutTargetTypeKey: "heart.rate.zone",
    };
    step.targetValueOne = s.ziel.vonBpm;
    step.targetValueTwo = s.ziel.bisBpm;
  } else {
    step.targetType = { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" };
  }

  return step;
}

export function baueGarminWorkoutJson(w: WorkoutStruktur): object {
  const zaehler = { n: 0 };

  if (w.sport === "kraft") {
    // Kraft: Übungen als Schritte mit Beschreibung — das inoffizielle Format
    // bildet nicht jede Übung als echte Satzstruktur ab, die Anleitung
    // erscheint aber auf der Uhr im Schritt-Text.
    const schritte: GarminStep[] = (w.uebungen ?? []).map((u) => {
      zaehler.n += 1;
      return {
        type: "ExecutableStepDTO",
        stepOrder: zaehler.n,
        stepType: STEP_TYPE.intervall,
        description: [
          u.name,
          u.saetze ? `${u.saetze} Sätze` : null,
          u.wdh ? `à ${u.wdh} Wdh` : null,
          u.dauerS ? `${u.dauerS}s` : null,
          u.gewichtKg ? `${u.gewichtKg} kg` : null,
          u.notiz,
        ]
          .filter(Boolean)
          .join(" · "),
        endCondition: u.dauerS
          ? { conditionTypeId: 2, conditionTypeKey: "time" }
          : { conditionTypeId: 1, conditionTypeKey: "lap.button" },
        ...(u.dauerS ? { endConditionValue: u.dauerS * (u.saetze || 1) } : {}),
        targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target" },
      };
    });
    return {
      workoutName: w.name,
      sportType: { sportTypeId: 5, sportTypeKey: "strength_training" },
      workoutSegments: [
        {
          segmentOrder: 1,
          sportType: { sportTypeId: 5, sportTypeKey: "strength_training" },
          workoutSteps: schritte,
        },
      ],
    };
  }

  const schritte = (w.schritte ?? []).map((s) => schrittZuGarmin(s, zaehler));
  return {
    workoutName: w.name,
    sportType: { sportTypeId: 1, sportTypeKey: "running" },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId: 1, sportTypeKey: "running" },
        workoutSteps: schritte,
      },
    ],
  };
}
