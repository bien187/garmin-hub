/**
 * Archiv-Ansicht für Planwochen vor dem Programmstart — rein, client-sicher.
 *
 * Wochen vor `PROGRAMM_START` stammen aus dem früheren Programm. Ihre
 * Einträge bleiben in der DB unverändert; angezeigt werden sie neutral
 * (Art der Einheit und Dauer) und schreibgeschützt.
 */

import { minutenAusTitel } from "./plan-typen";

const LABEL: Record<string, string> = {
  lauf_z2: "Lockerer Lauf",
  langer_lauf: "Langer Lauf",
  intervalle: "Intervalle",
  huegel_intervalle: "Hügel-Intervalle",
  lastlauf: "Lauf mit Zusatzlast",
  probe_ep: "Leistungstest",
  kraft: "Gym",
  klimmzuege: "Gym: Klimmzüge",
  liegestuetze: "Liegestütze",
  rumpf: "Rumpf",
  gtg: "Klimmzüge über den Tag",
  ruhe: "Ruhetag",
};

/** Typen, die im Archiv nicht erscheinen (reine Termin-Marker ohne Training) */
const AUSGEBLENDET = ["ep"];

export function imArchivSichtbar(typ: string): boolean {
  return !AUSGEBLENDET.includes(typ);
}

/** Neutraler Titel eines Archiv-Eintrags, z. B. „Lockerer Lauf · 45 Min" */
export function archivTitel(typ: string, titel: string): string {
  const basis = LABEL[typ] ?? "Einheit";
  const min = typ === "ruhe" ? null : minutenAusTitel(titel);
  return min != null ? `${basis} · ${min} Min` : basis;
}
