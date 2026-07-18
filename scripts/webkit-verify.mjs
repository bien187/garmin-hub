import { webkit } from "playwright";
const log = (s) => console.log(s);
setTimeout(() => { console.log("WATCHDOG"); process.exit(2); }, 420_000);
const browser = await webkit.launch({ timeout: 60000 });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => log("[pageerror] " + String(e).slice(0, 200)));

await page.goto("https://garmin-hub.vercel.app/login", { timeout: 45000 });
await page.fill("input[type=password]", process.env.APP_PW);
await page.click("button[type=submit]");
await page.waitForURL("https://garmin-hub.vercel.app/", { timeout: 20000 }).catch(() => {});
log("nach Login: " + page.url());

await page.goto("https://garmin-hub.vercel.app/body", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await page.getByRole("link", { name: "Dashboard" }).first().click();
await page.waitForTimeout(5000);
log("nach Dashboard-Klick: " + page.url());

const mid = process.env.MID;
await page.goto(`https://garmin-hub.vercel.app/activities/${mid}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector("text=/wird vorgeladen/", { state: "detached", timeout: 40000 }).catch(() => log("Overlay blieb!"));
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/ghq-wk-morschach-vor.png" });
await page.getByRole("button", { name: /Flyover/ }).click();
await page.waitForTimeout(9000);
await page.screenshot({ path: "/tmp/ghq-wk-morschach.png" });
log("fertig");
await browser.close();
process.exit(0);
