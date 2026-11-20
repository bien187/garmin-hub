import { describe, expect, it } from "vitest";
import { istKraft, istLauf, sportName, sportart } from "../sport";

describe("sport", () => {
  it("erkennt Lauf- und Kraft-Typen", () => {
    expect(istLauf("running")).toBe(true);
    expect(istLauf("trail_running")).toBe(true);
    expect(istLauf("cycling")).toBe(false);
    expect(istKraft("strength_training")).toBe(true);
  });
  it("Sportart und Name für Icons", () => {
    expect(sportart("trail_running")).toBe("trail");
    expect(sportart("treadmill_running")).toBe("lauf");
    expect(sportart("road_biking")).toBe("velo");
    expect(sportart("hiking")).toBe("wandern");
    expect(sportart("lap_swimming")).toBe("schwimmen");
    expect(sportart("yoga")).toBe("sonstiges");
    expect(sportName("strength_training")).toBe("Kraft");
  });
});
