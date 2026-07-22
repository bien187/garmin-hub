import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });

// --- Desktop: Flyover Lenzburg (flach) + Morschach (bergig) ---
const desktop = await (await browser.newContext({ viewport: { width: 1000, height: 850 } })).newPage();
desktop.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await desktop.goto("https://garmin-hub.vercel.app/login");
await desktop.fill("input[type=password]", process.env.APP_PW);
await desktop.click("button[type=submit]");
await desktop.waitForTimeout(4000);

for (const [name, id] of [["lenzburg", "23572376914"], ["morschach", "23563223828"]]) {
  await desktop.goto(`https://garmin-hub.vercel.app/activities/${id}`, { waitUntil: "domcontentloaded" });
  await desktop.waitForSelector("text=/wird vorgeladen/", { state: "detached", timeout: 45000 }).catch(() => console.log(name, "Overlay blieb!"));
  await desktop.waitForTimeout(1500);
  await desktop.getByRole("button", { name: /Flyover/ }).click();
  await desktop.waitForTimeout(9000); // ~9 s in den 30-s-Flug
  await desktop.getByRole("button", { name: /Pause/ }).click().catch(() => {});
  await desktop.waitForTimeout(5000);
  await desktop.screenshot({ path: `/tmp/ghq-v2-${name}.png` });
  console.log(name, "Screenshot ok");
}

// --- Mobile 390px: Navbar fix + interner Scroller ---
const mobil = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mobil.goto("https://garmin-hub.vercel.app/login");
await mobil.fill("input[type=password]", process.env.APP_PW);
await mobil.click("button[type=submit]");
await mobil.waitForTimeout(4000);
const check = await mobil.evaluate(() => {
  const scroller = document.getElementById("app-scroll");
  return {
    bodyScrollbar: document.documentElement.scrollHeight > window.innerHeight,
    scrollerDa: Boolean(scroller),
    scrollerScrollt: scroller ? scroller.scrollHeight > scroller.clientHeight : null,
    navFix: getComputedStyle(document.querySelector("nav.fixed")).position,
  };
});
console.log("Mobile Dashboard:", JSON.stringify(check));
await mobil.evaluate(() => document.getElementById("app-scroll")?.scrollTo(0, 400));
await mobil.waitForTimeout(500);
await mobil.screenshot({ path: "/tmp/ghq-v2-mobil.png" });
await browser.close();
