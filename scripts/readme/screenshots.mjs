/**
 * Nimmt die README-Screenshots aus der laufenden App auf (Playwright/Chromium).
 *
 * Voraussetzung: Produktionsserver mit FIKTIVEN Demo-Daten
 * (scripts/readme/demo-daten.mjs), z. B. auf http://127.0.0.1:3999.
 *
 *   GHQ_URL=http://127.0.0.1:3999 GHQ_PASSWORT=… node scripts/readme/screenshots.mjs
 *
 * Lokal läuft der Server ohne TLS. Die App sendet aber CSP mit
 * `upgrade-insecure-requests` und HSTS; ohne Anpassung würde der Browser alle
 * Assets auf https umschreiben und nichts laden. Deshalb entfernt das Skript
 * diese beiden Header NUR im Testbrowser — an der App ändert sich nichts.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASIS = process.env.GHQ_URL ?? "http://127.0.0.1:3999";
const PASSWORT = process.env.GHQ_PASSWORT;
if (!PASSWORT) throw new Error("GHQ_PASSWORT fehlt (App-Passwort des Demo-Servers)");
const ZIEL = new URL("../../docs/screenshots/", import.meta.url).pathname;
mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--lang=de-CH"],
});

async function kontext({ breite, hoehe, mobil }) {
  const ctx = await browser.newContext({
    viewport: { width: breite, height: hoehe },
    deviceScaleFactor: 2,
    isMobile: mobil,
    hasTouch: mobil,
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
    colorScheme: "dark",
    // Fiktiver Standort für den Ortungsknopf der Karte (Bern), nie der echte
    geolocation: { latitude: 46.9468, longitude: 7.4515 },
    permissions: ["geolocation"],
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
  const login = await ctx.request.post(`${BASIS}/api/auth/login`, { data: { passwort: PASSWORT } });
  if (!login.ok()) throw new Error(`Login fehlgeschlagen (${login.status()})`);
  return ctx;
}

const fehler = [];
// Optional nur einzelne Aufnahmen: GHQ_NUR=mobile-plan,desktop-plan
const NUR = process.env.GHQ_NUR ? process.env.GHQ_NUR.split(",").map((x) => x.trim()) : null;
async function aufnahme(ctx, pfad, datei, { warten = 5000, vorher } = {}) {
  if (NUR && !NUR.includes(datei.replace(".png", ""))) return;
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fehler.push(`${pfad}: ${String(e).slice(0, 160)}`));
  await p.goto(BASIS + pfad, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await p.waitForTimeout(warten);
  // 3D-Karte der Aktivität: warten, bis das Vorladen fertig ist
  await p.getByText(/wird vorgeladen/).waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
  if (vorher) await vorher(p);
  const ueberlauf = await p.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth);
  await p.screenshot({ path: ZIEL + datei });
  console.log(`${datei}${ueberlauf ? "  (Achtung: horizontaler Überlauf)" : ""}`);
  await p.close();
}

/* Aktivitäten für die Detailansicht aus der Demo-DB wählen */
const mobil = await kontext({ breite: 390, hoehe: 844, mobil: true });
// Abfrage aus einer Seite heraus: das Session-Cookie ist `Secure` und wird
// von Chromium nur im Seitenkontext auch über http://127.0.0.1 gesendet.
const hilfsSeite = await mobil.newPage();
await hilfsSeite.goto(`${BASIS}/login`, { waitUntil: "domcontentloaded" });
const eintraege = await hilfsSeite.evaluate(async () => (await (await fetch("/api/activities")).json()).aktivitaeten);
await hilfsSeite.close();
const langer = eintraege.find((a) => /Langer Lauf/.test(a.name ?? "")) ?? eintraege[0];
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());

/* Desktop: Hauptbild + breite Ansichten */
const desktop = await kontext({ breite: 1440, hoehe: 900, mobil: false });
await aufnahme(desktop, "/", "desktop-dashboard.png", { warten: 7000 });
await aufnahme(desktop, `/activities/${langer.id}`, "desktop-aktivitaet.png", { warten: 12000 });
await aufnahme(desktop, `/schlaf/${heute}`, "desktop-schlaf.png", { warten: 7000 });

/* Mobil: Galerie „Ein Blick in die App" */
await aufnahme(mobil, "/", "mobile-dashboard.png", { warten: 7000 });
await aufnahme(mobil, "/activities", "mobile-aktivitaeten.png", { warten: 6000 });
await aufnahme(mobil, `/activities/${langer.id}`, "mobile-aktivitaet.png", { warten: 12000 });
await aufnahme(mobil, "/map", "mobile-karte.png", {
  warten: 8000,
  vorher: async (p) => {
    // Zum fiktiven Standort springen und eine kurze Route per Klick bauen
    await p.locator(".maplibregl-ctrl-geolocate").click();
    await p.waitForTimeout(5000);
    const box = await p.locator(".maplibregl-canvas").boundingBox();
    const punkte = [[0.3, 0.35], [0.7, 0.3], [0.75, 0.6], [0.35, 0.65], [0.3, 0.36]];
    for (const [fx, fy] of punkte) {
      await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await p.waitForTimeout(3500);
    }
    await p.waitForTimeout(4000);
  },
});
await aufnahme(mobil, "/plan", "mobile-plan.png", {
  warten: 6000,
  vorher: async (p) => {
    // Woche mit EP-Tagen zeigen
    const weiter = p.locator("button:has(svg.lucide-chevron-right)").first();
    for (let i = 0; i < 2; i++) {
      await weiter.click();
      await p.waitForTimeout(2500);
    }
    // Zur Tagesliste mit EP-Tagen und Taper-Begründungen scrollen
    await p.locator('button[aria-haspopup="dialog"]').first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(800);
  },
});
await aufnahme(mobil, "/body", "mobile-koerper.png", { warten: 6000 });
await aufnahme(mobil, `/schlaf/${heute}`, "mobile-schlaf.png", { warten: 7000 });

/* Weitere Ansichten */
const zuEpWoche = async (p) => {
  const weiter = p.locator("button:has(svg.lucide-chevron-right)").first();
  for (let i = 0; i < 2; i++) {
    await weiter.click();
    await p.waitForTimeout(2500);
  }
};
const reiter = (name) => async (p) => {
  await p.getByRole("tab", { name }).click();
  await p.waitForTimeout(2500);
};
await aufnahme(desktop, "/plan", "desktop-plan.png", {
  warten: 6000,
  vorher: async (p) => {
    await zuEpWoche(p);
    await p.locator('button[aria-haspopup="dialog"]').first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(800);
  },
});
await aufnahme(mobil, "/plan", "mobile-ep-checkliste.png", {
  warten: 6000,
  vorher: async (p) => {
    await zuEpWoche(p);
    await p.locator('button[aria-haspopup="dialog"]').first().click();
    await p.locator('[role="checkbox"]').first().waitFor({ timeout: 30_000 });
    await p.waitForTimeout(1200);
  },
});
await aufnahme(mobil, "/plan", "mobile-benchmarks.png", { warten: 6000, vorher: reiter("Benchmarks") });
await aufnahme(mobil, "/plan", "mobile-probe-ep.png", {
  warten: 6000,
  vorher: async (p) => {
    // Geführter Ablauf in EP-Reihenfolge mit fiktiven Resultaten bis zur Sofort-Benotung
    await reiter("Probe-EP")(p);
    for (const wert of ["9", "31", "92", "128"]) {
      await p.locator('input[type="number"]').first().fill(wert);
      await p.getByRole("button", { name: /Weiter/ }).click();
      await p.waitForTimeout(700);
    }
    const felder = p.locator('input[type="number"]');
    await felder.nth(0).fill("31");
    await felder.nth(1).fill("20");
    await p.getByRole("button", { name: /Weiter/ }).click();
    await p.getByText("Probe-EP Resultat").waitFor({ timeout: 15_000 });
    await p.waitForTimeout(1200);
  },
});
await aufnahme(mobil, "/plan", "mobile-generator.png", {
  warten: 6000,
  vorher: async (p) => {
    await reiter("Generator")(p);
    await p.getByRole("button", { name: "Hart" }).click();
    await p.getByRole("button", { name: /Workout bauen/ }).click();
    await p.getByText(/Nach diesem Lauf/).waitFor({ timeout: 30_000 });
    await p.waitForTimeout(1200);
  },
});
await aufnahme(mobil, `/schlaf/${heute}`, "mobile-schlaf-verlauf.png", {
  warten: 7000,
  vorher: async (p) => {
    await p.getByText("Herzfrequenz in der Nacht").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(1200);
  },
});
await aufnahme(mobil, "/body", "mobile-muskel-detail.png", {
  warten: 6000,
  vorher: async (p) => {
    // Quadrizeps in der Vorderansicht antippen → Bottom-Sheet mit Beiträgen
    const box = await p.locator("svg").filter({ has: p.locator("path.cursor-pointer") }).first().boundingBox();
    await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.58);
    await p.waitForTimeout(2000);
  },
});

await browser.close();
if (fehler.length) console.log("Seitenfehler:\n" + fehler.join("\n"));
