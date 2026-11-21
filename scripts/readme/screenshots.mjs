/**
 * Nimmt die README-Screenshots aus der öffentlichen Demo auf (/demo, nur
 * fiktive Daten aus public/demo/daten — kein Login, keine Datenbank).
 *
 *   pnpm build && pnpm start -p 3999
 *   GHQ_URL=http://127.0.0.1:3999 node scripts/readme/screenshots.mjs
 *
 * Nutzt den von Playwright installierten Chromium oder, mit GHQ_CHROME=1,
 * das lokal installierte Google Chrome. Lokal läuft der Server ohne TLS; CSP
 * (`upgrade-insecure-requests`) und HSTS werden deshalb NUR im Testbrowser
 * entfernt — an der App ändert sich nichts.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const BASIS = process.env.GHQ_URL ?? "http://127.0.0.1:3999";
const ZIEL = new URL("../../docs/screenshots/", import.meta.url).pathname;
mkdirSync(ZIEL, { recursive: true });

const kern = JSON.parse(readFileSync(new URL("../../public/demo/daten/kern.json", import.meta.url), "utf8"));
const lauf = kern.aktivitaeten.find((a) => a.typ === "running" && a.polyline) ?? kern.aktivitaeten[0];
const nacht = kern.schlafNaechte.at(-1);

const browser = await chromium.launch(process.env.GHQ_CHROME ? { channel: "chrome" } : {});

async function kontext({ breite, hoehe, mobil }) {
  const ctx = await browser.newContext({
    viewport: { width: breite, height: hoehe },
    deviceScaleFactor: 2,
    isMobile: mobil,
    hasTouch: mobil,
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
    colorScheme: "dark",
  });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    if (!req.url().startsWith(BASIS)) return route.continue();
    const resp = await route.fetch({ timeout: 90_000 });
    const h = { ...resp.headers() };
    delete h["content-security-policy"];
    delete h["strict-transport-security"];
    await route.fulfill({ response: resp, headers: h });
  });
  return ctx;
}

const fehler = [];
// Optional nur einzelne Aufnahmen: GHQ_NUR=mobile-plan,desktop-plan
const NUR = process.env.GHQ_NUR ? process.env.GHQ_NUR.split(",").map((x) => x.trim()) : null;
async function aufnahme(ctx, pfad, datei, { warten = 3500, vorher } = {}) {
  if (NUR && !NUR.includes(datei.replace(".png", ""))) return;
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fehler.push(`${pfad}: ${String(e).slice(0, 160)}`));
  await p.goto(BASIS + pfad, { waitUntil: "networkidle", timeout: 90_000 });
  await p.waitForTimeout(warten);
  if (vorher) await vorher(p);
  const ueberlauf = await p.evaluate(() => {
    const s = document.getElementById("app-scroll");
    return (s ? s.scrollWidth > s.clientWidth : false) || document.scrollingElement.scrollWidth > window.innerWidth;
  });
  await p.screenshot({ path: ZIEL + datei });
  console.log(`${datei}${ueberlauf ? "  (Achtung: horizontaler Überlauf)" : ""}`);
  await p.close();
}

/** Scrollt den internen Scroll-Container so, dass `text` oben steht */
const scrolleZu = (text) => async (p) => {
  await p.getByText(text).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await p.waitForTimeout(800);
};

/** Entwicklung → Aerobic Performance öffnen und den Bereich oben zeigen */
const zuAerob = async (p) => {
  const tab = p.getByRole("tab", { name: "Aerobic Performance" });
  await tab.click();
  await tab.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await p.evaluate(() => document.getElementById("app-scroll")?.scrollBy(0, -64));
  await p.mouse.move(2, 2); // kein Tooltip im Bild
  await p.waitForTimeout(800);
};

const mobil = await kontext({ breite: 390, hoehe: 844, mobil: true });
await aufnahme(mobil, "/demo", "mobile-dashboard.png");
await aufnahme(mobil, "/demo", "mobile-dashboard-woche.png", { vorher: scrolleZu("Diese Woche") });
await aufnahme(mobil, "/demo/plan", "mobile-plan.png");
await aufnahme(mobil, "/demo/plan?tab=generator", "mobile-generator.png");
await aufnahme(mobil, "/demo/body", "mobile-gewicht.png", { vorher: scrolleZu("Smart Weight Tracking") });
await aufnahme(mobil, "/demo/body", "mobile-messprotokoll.png", {
  vorher: async (p) => {
    await p.getByText("Tippe auf eine Messung").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.locator("#gewicht ul button").first().click();
    await p.waitForTimeout(900);
  },
});
await aufnahme(mobil, "/demo/body", "mobile-koerper.png", { vorher: scrolleZu("Muskelstatus") });
await aufnahme(mobil, "/demo/activities", "mobile-aktivitaeten.png");
await aufnahme(mobil, `/demo/activities/${lauf.id}`, "mobile-aktivitaet.png", { warten: 6000 });
await aufnahme(mobil, "/demo/map", "mobile-karte.png", { warten: 5000 });
await aufnahme(mobil, `/demo/schlaf/${nacht}`, "mobile-schlaf.png");
await mobil.close();

const desktop = await kontext({ breite: 1440, hoehe: 900, mobil: false });
await aufnahme(desktop, "/demo", "desktop-dashboard.png");
await aufnahme(desktop, "/demo", "desktop-aerob.png", { vorher: zuAerob });
await aufnahme(desktop, "/demo/plan", "desktop-plan.png");
await aufnahme(desktop, "/demo/body", "desktop-gewicht.png", { vorher: scrolleZu("Smart Weight Tracking") });
await aufnahme(desktop, `/demo/activities/${lauf.id}`, "desktop-aktivitaet.png", { warten: 6000 });
await aufnahme(desktop, `/demo/schlaf/${nacht}`, "desktop-schlaf.png");
await desktop.close();

await browser.close();
if (fehler.length) {
  console.error("Seitenfehler:\n" + fehler.join("\n"));
  process.exit(1);
}
