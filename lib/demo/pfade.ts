/**
 * Pfad-Hilfen für die öffentliche Demo unter `/demo`. Client- und
 * server-sicher, keine Imports.
 */

/** Basis der Demo-Umgebung */
export const DEMO_BASIS = "/demo";

/** Liegt der Pfad in der Demo? (`/demo`, `/demo/…` — nicht `/demonstration`) */
export function istDemoPfad(pfad: string): boolean {
  return pfad === DEMO_BASIS || pfad.startsWith(DEMO_BASIS + "/");
}

/** Demo-Präfix entfernen: `/demo/plan` → `/plan`, `/demo` → `/` */
export function ohneBasis(pfad: string): string {
  if (!istDemoPfad(pfad)) return pfad;
  return pfad.slice(DEMO_BASIS.length) || "/";
}

/**
 * App-internen Pfad mit Basis versehen: `mitBasis("/demo", "/plan?tab=x")`
 * → `/demo/plan?tab=x`, `mitBasis("/demo", "/")` → `/demo`. Ohne Basis
 * (reguläre App) unverändert. Externe/relative Links bleiben unangetastet.
 */
export function mitBasis(basis: string, href: string): string {
  if (!basis || !href.startsWith("/") || href.startsWith("//")) return href;
  if (href === "/") return basis;
  if (href.startsWith("/?") || href.startsWith("/#")) return basis + href.slice(1);
  return basis + href;
}
