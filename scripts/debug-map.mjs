/* Tiefendiagnose Karte: Netzwerk (Style/Tiles), Canvas-Zustand, WebGL */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORT = process.env.APP_PW ?? "dev";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

page.on("console", (m) => console.log(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${String(e).slice(0, 300)}`));
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("openfreemap") || u.includes("amazonaws") || u.includes("brouter")) {
    console.log(`[net ${r.status()}] ${u.slice(0, 110)}`);
  }
});

await page.goto(`${BASE}/login`);
await page.fill("input[type=password]", PASSWORT);
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});

await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);

const info = await page.evaluate(() => {
  const canvas = document.querySelector(".maplibregl-canvas");
  const c2 = document.querySelector("canvas");
  const gl = document.createElement("canvas").getContext("webgl2");
  return {
    maplibreCanvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    irgendeinCanvas: c2 ? { w: c2.width, h: c2.height } : null,
    webgl2: Boolean(gl),
    mapDivKinder: document.querySelectorAll(".maplibregl-map *").length,
    cssGeladen: Boolean(
      [...document.styleSheets].find((s) => {
        try {
          return [...s.cssRules].some((r) => r.cssText?.includes("maplibregl-canvas"));
        } catch {
          return false;
        }
      })
    ),
  };
});
console.log("INFO:", JSON.stringify(info));
await page.screenshot({ path: "/tmp/ghq-map-debug.png" });
await browser.close();
