/** Sekunden → "h:mm:ss" bzw. "m:ss" */
export function formatDauer(s: number): string {
  const sec = Math.round(s);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const rest = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

/** Pace in s/km → "m:ss/km" */
export function formatPace(sProKm: number | null | undefined): string {
  if (!sProKm || !isFinite(sProKm) || sProKm <= 0) return "–";
  const m = Math.floor(sProKm / 60);
  const s = Math.round(sProKm % 60);
  if (s === 60) return `${m + 1}:00/km`;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function formatKm(meter: number | null | undefined, dezimal = 2): string {
  if (meter == null) return "–";
  return `${(meter / 1000).toFixed(dezimal)} km`;
}

export function formatHm(meter: number | null | undefined): string {
  if (meter == null) return "–";
  return `${Math.round(meter)} Hm`;
}

/** ISO-Datum (yyyy-mm-dd) in lokaler Zeit */
export function isoDatum(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

/**
 * Versatz der App-Uhr in ms. Bleibt in der regulären App immer 0; nur die
 * öffentliche Demo (`components/demo/demo-rahmen.tsx`) setzt ihn im Browser,
 * damit „heute" dem fiktiven Datenstand entspricht. Auf dem Server nie gesetzt.
 */
let uhrVersatzMs = 0;

export function setzeUhrVersatz(ms: number): void {
  if (typeof window === "undefined") return; // Server: immer echte Zeit
  uhrVersatzMs = ms;
}

/** Aktuelle App-Zeit in ms (Date.now() + Demo-Versatz) */
export function jetztMs(): number {
  return Date.now() + uhrVersatzMs;
}

export function heuteIso(): string {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(jetztMs()));
}

export function addTage(iso: string, tage: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + tage);
  return isoDatum(d);
}

/** Differenz zweier ISO-Daten in Tagen (b − a) */
export function tageDiff(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime();
  const db = new Date(b + "T12:00:00").getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Montag der Woche eines ISO-Datums */
export function montagVon(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wd = (d.getDay() + 6) % 7; // Mo=0
  d.setDate(d.getDate() - wd);
  return isoDatum(d);
}

export function formatDatum(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-CH", { day: "numeric", month: "short" });
}

export function formatDatumLang(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** „Mi 18.11.2026" — Wochentag kurz + numerisches Datum */
export function formatDatumNumerisch(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wt = d.toLocaleDateString("de-CH", { weekday: "short" }).replace(".", "");
  const datum = d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${wt} ${datum}`;
}

/** „Sa 7.11." — Wochentag kurz ohne Punkt + Tag.Monat (für Hinweise) */
export function formatDatumKurz(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wt = d.toLocaleDateString("de-CH", { weekday: "short" }).replace(".", "");
  return `${wt} ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function formatZeit(d: Date): string {
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

/** Note auf 1 Dezimale, Schweizer Stil */
export function formatNote(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "–";
  return n.toFixed(1);
}
