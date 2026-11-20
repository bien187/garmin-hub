import { describe, expect, it } from "vitest";
import { PROGRAMM_START, trainingsblock } from "../block";

describe("trainingsblock", () => {
  it("startet am Programmstart mit Aufbau 1", () => {
    expect(PROGRAMM_START).toBe("2026-11-23");
    expect(trainingsblock("2026-11-23")).toMatchObject({ woche: 1, index: 0, name: "Aufbau 1", entlastung: false });
  });

  it("gilt für die ganze Woche (massgebend ist der Montag)", () => {
    expect(trainingsblock("2026-11-29").woche).toBe(1);
    expect(trainingsblock("2026-11-30").woche).toBe(2);
  });

  it("jede vierte Woche ist Entlastung, danach beginnt der nächste Block", () => {
    expect(trainingsblock("2026-12-14")).toMatchObject({ woche: 4, index: 3, entlastung: true });
    expect(trainingsblock("2026-12-21")).toMatchObject({ woche: 1, index: 4 });
  });

  it("rechnet auch rückwärts lückenlos weiter", () => {
    expect(trainingsblock("2026-11-16")).toMatchObject({ woche: 4, index: -1 });
    expect(trainingsblock("2026-11-09").woche).toBe(3);
  });
});
