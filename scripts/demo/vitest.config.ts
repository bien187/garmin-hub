import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Eigene Vitest-Konfiguration NUR für die Aufnahme der Demo-Daten
 * (scripts/demo/aufnahme.ts). Läuft nicht mit `pnpm test`.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../..") } },
  test: {
    root: path.resolve(__dirname, "../.."),
    include: ["scripts/demo/*.aufnahme.ts"],
    environment: "node",
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
  },
});
