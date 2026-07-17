/* Geometrie-Analyse des Karten-Containers */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORT = process.env.APP_PW ?? "dev";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

await page.goto(`${BASE}/login`);
await page.fill("input[type=password]", PASSWORT);
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      pos: cs.position,
      height: cs.height,
      display: cs.display,
      visibility: cs.visibility,
      klassen: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 120),
    };
  };
  const wrapper = document.querySelector("main > div");
  const mapDiv = document.querySelector(".maplibregl-map");
  const canvas = document.querySelector(".maplibregl-canvas");
  const main = document.querySelector("main");
  return {
    main: r(main),
    wrapper: r(wrapper),
    mapDiv: r(mapDiv),
    canvas: r(canvas),
    canvasAttr: canvas ? { w: canvas.width, h: canvas.height } : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
