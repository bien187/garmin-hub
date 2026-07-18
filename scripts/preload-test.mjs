import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let tiles = 0;
page.on("response", (r) => {
  if (r.url().includes("elevation-tiles") || r.url().includes("openfreemap.org/planet/")) tiles++;
});
await page.goto("https://garmin-hub.vercel.app/login");
await page.fill("input[type=password]", process.env.APP_PW);
await page.click("button[type=submit]");
await page.waitForTimeout(4000);
await page.goto("https://garmin-hub.vercel.app/activities/23572376914", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/ghq-preload-1.png" });
// warten bis Overlay verschwindet (max 30 s)
await page.waitForSelector("text=/wird vorgeladen/", { state: "detached", timeout: 30000 }).catch(() => console.log("Overlay blieb sichtbar!"));
console.log("Tiles vorgeladen:", tiles);
await page.screenshot({ path: "/tmp/ghq-preload-2.png" });
const playAktiv = await page.getByRole("button", { name: /Flyover/ }).isEnabled();
console.log("Play-Button aktiv:", playAktiv);
await page.getByRole("button", { name: /Flyover/ }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: "/tmp/ghq-preload-3.png" });
await browser.close();
