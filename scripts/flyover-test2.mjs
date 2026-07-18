import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 300)); });
await page.goto(`${BASE}/login`);
await page.fill("input[type=password]", process.env.APP_PW);
await page.click("button[type=submit]");
await page.waitForTimeout(4000);
await page.goto(`${BASE}/activities/23572376914`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12000);
await page.screenshot({ path: "/tmp/ghq-fly-vorher.png" });
const btn = page.getByRole("button", { name: /Flyover/ });
console.log("Flyover-Button sichtbar:", await btn.count());
if (await btn.count()) {
  await btn.click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: "/tmp/ghq-fly-fix.png" });
  console.log("Play-Screenshot gespeichert");
}
await browser.close();
