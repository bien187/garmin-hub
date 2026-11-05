/**
 * End-to-End-Prüfung der öffentlichen Demo gegen einen laufenden Server
 * (z. B. Produktionsbuild: `pnpm build && pnpm start -p 3999`).
 *
 *   GHQ_URL=http://127.0.0.1:3999 node scripts/verify-demo.mjs
 *
 * Prüft OHNE Login (frischer Browser ohne Cookies), Desktop und 390 px:
 *  - /demo und alle Demo-Seiten laden, kein Redirect auf /login
 *  - Demo-Hinweis sichtbar, Dashboard gefüllt, kein horizontales Scrollen
 *  - Navigation, Aktivitätsdetail, Wochenwechsel im Plan, Schlafdetail
 *  - KEIN Request an /api/* verlässt den Browser
 *  - die reguläre App bleibt geschützt (/ → /login, /api → 401)
 *
 * Wie scripts/readme/screenshots.mjs entfernt das Skript lokal (ohne TLS) nur
 * im Testbrowser CSP-`upgrade-insecure-requests` und HSTS.
 */
import { chromium } from "playwright";

const BASIS = process.env.GHQ_URL ?? "http://127.0.0.1:3999";
const fehler = [];
const pruefe = (bedingung, text) => {
  if (!bedingung) fehler.push(text);
  console.log(`${bedingung ? "ok  " : "FEHL"} ${text}`);
};

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function kontext({ breite, hoehe, mobil }) {
  const ctx = await browser.newContext({
    viewport: { width: breite, height: hoehe },
    isMobile: mobil,
    hasTouch: mobil,
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
    colorScheme: "dark",
  });
  await ctx.route("**/*", async (route) => {
    if (!route.request().url().startsWith(BASIS)) return route.continue();
    const resp = await route.fetch({ timeout: 60_000 });
    const h = { ...resp.headers() };
    delete h["content-security-policy"];
    delete h["strict-transport-security"];
    await route.fulfill({ response: resp, headers: h });
  });
  return ctx;
}

async function seite(ctx, label) {
  const p = await ctx.newPage();
  p.apiAnfragen = [];
  p.on("pageerror", (e) => fehler.push(`${label}: JS-Fehler ${String(e).slice(0, 160)}`));
  p.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(BASIS).origin && u.pathname.startsWith("/api/")) p.apiAnfragen.push(u.pathname);
  });
  return p;
}

async function oeffne(p, pfad) {
  const res = await p.goto(BASIS + pfad, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.getByRole("note").waitFor({ timeout: 30_000 });
  await p.waitForTimeout(1500);
  return res;
}

const ueberlauf = (p) => p.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1);

for (const [name, geraet] of [
  ["Desktop", { breite: 1440, hoehe: 900, mobil: false }],
  ["Mobil 390", { breite: 390, hoehe: 844, mobil: true }],
]) {
  console.log(`\n== ${name}`);
  const ctx = await kontext(geraet);
  const p = await seite(ctx, name);

  const res = await oeffne(p, "/demo");
  pruefe(res.status() === 200 && new URL(p.url()).pathname === "/demo", `${name}: /demo ohne Login erreichbar`);
  pruefe(await p.getByText("Garmin-Hub-Demo. Alle Aktivitäten, Gesundheits- und Schlafwerte sind fiktive Testdaten.").isVisible(), `${name}: Demo-Hinweis sichtbar`);
  pruefe((await p.locator('a[href$="/settings"]').count()) === 0, `${name}: kein Link zu Einstellungen`);
  pruefe((await p.getByRole("button", { name: /synchronisieren/i }).count()) === 0, `${name}: kein Sync-Knopf`);
  await p.getByText("Bereitschaft heute").waitFor({ timeout: 20_000 });
  for (const t of ["EP-Noten · aktueller Stand", "Schlaf letzte Nacht", "Diese Woche", "Letzte Aktivität", "Nächstes Training", "All Time", "Muskelstatus"]) {
    pruefe(await p.getByText(t, { exact: false }).first().isVisible(), `${name}: Dashboard zeigt „${t}"`);
  }
  pruefe(!(await p.getByText("Noch keine Aktivitäten").count()), `${name}: Dashboard nicht leer`);
  await p.getByText(/^r = /).first().waitFor({ timeout: 15_000 }).catch(() => {});
  pruefe((await p.getByText(/^r = /).count()) > 0, `${name}: Insights mit Korrelationen`);
  pruefe(!(await ueberlauf(p)), `${name}: Dashboard ohne horizontales Scrollen`);

  // Navigation über die App-Navigation
  const nav = geraet.mobil ? p.locator("nav.nav-bar") : p.locator("aside nav");
  await nav.getByText("Aktivitäten").click();
  await p.waitForURL("**/demo/activities", { timeout: 20_000 });
  pruefe(true, `${name}: Navigation → /demo/activities`);
  await p.locator('a[href^="/demo/activities/"]').first().waitFor({ timeout: 20_000 });
  pruefe((await p.locator('a[href^="/demo/activities/"]').count()) >= 10, `${name}: Aktivitätenliste gefüllt`);
  pruefe((await p.locator('a[href^="/activities/"]').count()) === 0, `${name}: keine Links in die reguläre App`);
  await p.getByRole("button", { name: "Kraft" }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  pruefe(!(await ueberlauf(p)), `${name}: Aktivitätenliste ohne horizontales Scrollen`);
  await p.getByRole("button", { name: "Läufe" }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  await p.locator('a[href^="/demo/activities/"]').first().click();
  await p.waitForURL(/\/demo\/activities\/\d+/, { timeout: 20_000 });
  await p.getByText(/Splits|Herzfrequenz|Zonen/i).first().waitFor({ timeout: 30_000 }).catch(() => {});
  pruefe((await p.getByText(/Splits|Zonen/i).count()) > 0, `${name}: Aktivitätsdetail mit Analyse`);
  pruefe((await p.locator("canvas, svg.recharts-surface").count()) > 0, `${name}: Aktivitätsdetail mit Karte/Diagramm`);
  pruefe(!(await ueberlauf(p)), `${name}: Aktivitätsdetail ohne horizontales Scrollen`);

  // Plan: Wochenwechsel
  await oeffne(p, "/demo/plan");
  await p.getByText(/Woche|Phase/).first().waitFor({ timeout: 20_000 });
  const kopf = async () => (await p.locator("main").innerText()).slice(0, 400);
  const vorher = await kopf();
  await p.getByRole("button").filter({ has: p.locator("svg.lucide-chevron-right") }).first().click();
  await p.waitForTimeout(1200);
  pruefe((await kopf()) !== vorher, `${name}: Plan – Wechsel zur nächsten Woche`);
  pruefe(!(await ueberlauf(p)), `${name}: Plan ohne horizontales Scrollen`);

  // Körper, Karte, Schlaf, Einstellungen
  for (const [pfad, text] of [
    ["/demo/body", /Systemische Ermüdung/i],
    ["/demo/schlaf/2026-11-05", /Schlaf|Phasen|Tief/i],
    ["/demo/plan?tab=benchmarks", /Benchmark|Klimmz/i],
  ]) {
    await oeffne(p, pfad);
    pruefe((await p.getByText(text).count()) > 0, `${name}: ${pfad} zeigt Inhalte`);
    pruefe(!(await ueberlauf(p)), `${name}: ${pfad} ohne horizontales Scrollen`);
  }
  await oeffne(p, "/demo/plan?tab=generator");
  pruefe((await p.getByText("In der Demo deaktiviert.").count()) > 0, `${name}: Workout-Generator in der Demo deaktiviert`);
  pruefe(await p.getByRole("button", { name: /Workout bauen/ }).isDisabled(), `${name}: „Workout bauen" gesperrt`);
  await oeffne(p, "/demo/map");
  await p.waitForTimeout(3000);
  pruefe((await p.locator("canvas.maplibregl-canvas").count()) > 0, `${name}: Karte gerendert`);

  pruefe(p.apiAnfragen.length === 0, `${name}: kein /api-Request verlässt den Browser (${p.apiAnfragen.slice(0, 3).join(", ")})`);
  await ctx.close();
}

// Statuscodes ohne Cookie
const ctx = await kontext({ breite: 1280, hoehe: 800, mobil: false });
const kern = await (await ctx.request.get(BASIS + "/demo/daten/kern.json")).json();
for (const pfad of ["/demo", "/demo/activities", "/demo/plan", "/demo/body", `/demo/schlaf/${kern.schlafNaechte.at(-1)}`, `/demo/activities/${kern.aktivitaeten[0].id}`, "/demo/map"]) {
  const r = await ctx.request.get(BASIS + pfad, { maxRedirects: 0 });
  pruefe(r.status() === 200, `ohne Cookie: ${pfad} → ${r.status()}`);
}
for (const pfad of ["/", "/plan", "/settings", "/activities"]) {
  const r = await ctx.request.get(BASIS + pfad, { maxRedirects: 0 });
  pruefe([307, 308].includes(r.status()) && (r.headers().location ?? "").includes("/login"), `ohne Cookie: ${pfad} → ${r.status()} Login`);
}
for (const pfad of ["/api/activities", "/api/plan", "/api/settings"]) {
  const r = await ctx.request.get(BASIS + pfad, { maxRedirects: 0, headers: { "x-demo": "1" } });
  pruefe(r.status() === 401, `ohne Cookie, gefälschter x-demo: ${pfad} → ${r.status()}`);
}
const settings = await ctx.request.get(BASIS + "/demo/settings", { maxRedirects: 0 });
pruefe(settings.status() === 404, `/demo/settings existiert nicht (${settings.status()})`);
const post = await ctx.request.post(BASIS + "/demo/plan", { data: {}, maxRedirects: 0 });
pruefe(post.status() === 405, `POST /demo/plan → ${post.status()}`);
await ctx.close();

await browser.close();
console.log(fehler.length ? `\n${fehler.length} Fehler:\n- ${fehler.join("\n- ")}` : "\nAlle Prüfungen bestanden.");
process.exit(fehler.length ? 1 : 0);
