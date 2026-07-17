/* Headless-Diagnose: Konsolen-Fehler + Screenshots der Problemseiten */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORT = process.env.APP_PW ?? "dev";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const fehler = [];
page.on("console", (m) => {
  if (m.type() === "error") fehler.push(`[console] ${m.text().slice(0, 400)}`);
});
page.on("pageerror", (e) => fehler.push(`[pageerror] ${String(e).slice(0, 400)}`));
page.on("requestfailed", (r) => {
  if (!r.url().includes("favicon")) fehler.push(`[reqfail] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`);
});

// Login
await page.goto(`${BASE}/login`);
await page.fill("input[type=password]", PASSWORT);
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});

for (const pfad of process.argv.slice(2)) {
  fehler.length = 0;
  await page.goto(`${BASE}${pfad}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => fehler.push(`[goto] ${e}`));
  await page.waitForTimeout(9000);
  const datei = `/tmp/ghq-shot${pfad.replaceAll("/", "_") || "_home"}.png`;
  await page.screenshot({ path: datei });
  console.log(`\n=== ${pfad} → ${datei}`);
  console.log(fehler.length ? fehler.slice(0, 12).join("\n") : "(keine Fehler)");

  // Körper-Tab: auf einen Muskel klicken
  if (pfad === "/body") {
    fehler.length = 0;
    const muskel = page.locator("svg [class*=cursor-pointer]").first();
    if ((await muskel.count()) > 0) {
      await muskel.click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "/tmp/ghq-shot_body_klick.png" });
      console.log("=== /body nach Klick → /tmp/ghq-shot_body_klick.png");
      console.log(fehler.length ? fehler.slice(0, 12).join("\n") : "(keine Fehler)");
    } else {
      console.log("(kein klickbarer Muskel gefunden)");
    }
  }
}

await browser.close();
