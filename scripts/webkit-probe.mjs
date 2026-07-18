import { webkit } from "playwright";
const browser = await webkit.launch({ timeout: 60000 });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on("requestfailed", (r) => console.log("[reqfail]", r.method(), r.url().slice(0, 90), "→", r.failure()?.errorText));
await page.goto("https://garmin-hub.vercel.app/login");
await page.fill("input[type=password]", process.env.APP_PW);
await page.click("button[type=submit]");
await page.waitForTimeout(5000);
console.log("URL nach Login:", page.url());
await page.goto("https://garmin-hub.vercel.app/body", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// Manuelle Fetches wie sie der Next-Router machen würde
const tests = await page.evaluate(async () => {
  const out = [];
  for (const [name, url, headers] of [
    ["plain /", "/", {}],
    ["RSC /", "/", { RSC: "1" }],
    ["RSC /plan", "/plan", { RSC: "1" }],
    ["plain /plan", "/plan", {}],
  ]) {
    try {
      const r = await fetch(url, { headers });
      const len = (await r.text()).length;
      out.push(`${name}: ${r.status} (${len} B)`);
    } catch (e) {
      out.push(`${name}: FEHLER ${e}`);
    }
  }
  return out;
});
console.log(tests.join("\n"));

// Klick auf Aktivitäten-Link (funktionieren andere Navigationen?)
await page.getByRole("link", { name: "Aktivitäten" }).first().click();
await page.waitForTimeout(4000);
console.log("nach Klick Aktivitäten:", page.url());
await page.getByRole("link", { name: "Dashboard" }).first().click();
await page.waitForTimeout(4000);
console.log("nach Klick Dashboard:", page.url());
await browser.close();
