import { webkit } from "playwright";
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);
setTimeout(() => { console.log("WATCHDOG: Abbruch"); process.exit(2); }, 420_000);
log("starte webkit…");
const browser = await webkit.launch({ timeout: 60000 });
log("webkit gestartet");
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.setDefaultTimeout(30000);
page.on("console", (m) => { if (m.type() === "error") log("[console] " + m.text().slice(0, 200)); });
page.on("pageerror", (e) => log("[pageerror] " + String(e).slice(0, 200)));
await page.goto("https://garmin-hub.vercel.app/login", { timeout: 45000 });
await page.fill("input[type=password]", process.env.APP_PW);
await page.click("button[type=submit]");
await page.waitForTimeout(4000);
log("nach Login: " + page.url());

await page.goto("https://garmin-hub.vercel.app/body", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(4000);
const svgBox = await page.locator("svg[role=img]").first().boundingBox().catch(() => null);
log("Body-SVG: " + JSON.stringify(svgBox));
await page.screenshot({ path: "/tmp/ghq-wk-body.png" });

await page.getByRole("link", { name: "Dashboard" }).first().click();
await page.waitForTimeout(5000);
log("nach Dashboard-Klick: " + page.url());
await page.screenshot({ path: "/tmp/ghq-wk-dashboard.png" });

const mid = process.env.MID;
if (mid) {
  await page.goto(`https://garmin-hub.vercel.app/activities/${mid}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  log("Aktivität geladen, warte auf Vorladen…");
  await page.waitForSelector("text=/wird vorgeladen/", { state: "detached", timeout: 40000 }).catch(() => log("Overlay blieb!"));
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Flyover/ }).click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: "/tmp/ghq-wk-morschach.png" });
  log("Morschach-Screenshot ok");
}
await browser.close();
process.exit(0);
