import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Die Demo-Datenquelle ist der statische Snapshot in public/demo/daten/.
 * Kein Demo-Modul darf eine DB-Verbindung oder Server-Services zur Laufzeit
 * importieren — damit kann die Demo nie auf DATABASE_URL zugreifen, auch nicht
 * bei fehlender oder falscher Konfiguration. (Nur `import type` ist erlaubt.)
 */
const WURZEL = path.resolve(__dirname, "../../..");
const ORDNER = ["lib/demo", "components/demo", "app/demo"];
const VERBOTEN = [/@\/lib\/db/, /@\/lib\/server\/(?!plan-sync)/, /["']postgres["']/, /drizzle-orm/, /process\.env\.DATABASE_URL/, /DEMO_DATABASE_URL/];

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = path.join(ordner, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : dateien(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("Demo-Datenquelle", () => {
  it("importiert nie DB oder Server-Services zur Laufzeit", () => {
    const alle = ORDNER.flatMap((o) => dateien(path.join(WURZEL, o)));
    expect(alle.length).toBeGreaterThan(8);
    for (const datei of alle) {
      const laufzeitImporte = readFileSync(datei, "utf8")
        .split("\n")
        .filter((z) => /^\s*(import|export)\b.*from\s/.test(z) && !/^\s*import\s+type\b/.test(z) && !/^\s*export\s+type\b/.test(z));
      for (const zeile of laufzeitImporte) {
        for (const muster of VERBOTEN) expect(zeile, `${path.relative(WURZEL, datei)}: ${zeile}`).not.toMatch(muster);
      }
      // Code ohne Kommentare: kein Zugriff auf DATABASE_URL oder getDb()
      const code = readFileSync(datei, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, path.relative(WURZEL, datei)).not.toMatch(/DATABASE_URL|getDb\(/);
    }
  });

  it("lädt Daten nur aus /demo/daten", () => {
    const rahmen = readFileSync(path.join(WURZEL, "components/demo/demo-rahmen.tsx"), "utf8");
    expect(rahmen).toMatch(/DEMO_DATEN_PFAD/);
    expect(readFileSync(path.join(WURZEL, "lib/demo/konstanten.ts"), "utf8")).toMatch(/DEMO_DATEN_PFAD = "\/demo\/daten"/);
  });
});
