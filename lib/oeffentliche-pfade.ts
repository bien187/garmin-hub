/**
 * Pfade ohne Session-Pflicht (Middleware). Edge-sicher, keine Imports.
 *
 *  - Login + Auth-Endpoint
 *  - Cron (eigener CRON_SECRET-Check) und Python-Bridge (eigener
 *    x-internal-key-Check — Server-zu-Server-Aufruf ohne Session-Cookie)
 *  - `/demo`: öffentliche Demo mit fiktiven Daten. Sie liest NUR statische
 *    Dateien unter /demo/daten/ und beantwortet ihre /api-Aufrufe im Browser
 *    selbst — alle /api/*-Endpunkte der App bleiben geschützt.
 */
export const OEFFENTLICHE_PFADE = ["/login", "/api/auth/login", "/api/cron", "/api/bridge", "/demo"];

export function istOeffentlicherPfad(pathname: string): boolean {
  return OEFFENTLICHE_PFADE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
