import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "../polyline";

describe("polyline encode/decode", () => {
  it("Google-Referenzbeispiel", () => {
    const punkte: [number, number][] = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    expect(encodePolyline(punkte)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("Rundreise encode→decode", () => {
    const punkte: [number, number][] = [
      [47.38812, 8.15625], // Lenzburg
      [47.39001, 8.16211],
      [47.38455, 8.17004],
    ];
    const dekodiert = decodePolyline(encodePolyline(punkte));
    expect(dekodiert).toHaveLength(3);
    for (let i = 0; i < punkte.length; i++) {
      expect(dekodiert[i][0]).toBeCloseTo(punkte[i][0], 5);
      expect(dekodiert[i][1]).toBeCloseTo(punkte[i][1], 5);
    }
  });

  it("leere Liste", () => {
    expect(decodePolyline(encodePolyline([]))).toEqual([]);
  });
});
