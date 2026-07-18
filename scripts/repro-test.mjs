import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 600 } })).newPage();
const variante = process.argv[2] ?? "";
await page.goto(`file:///tmp/ghq-repro/repro.html${variante}`);
await page.waitForTimeout(12000);
const info = await page.evaluate(() => ({
  zoom: window.__map.getZoom().toFixed(2),
  pitch: window.__map.getPitch(),
  bearing: Math.round(window.__map.getBearing()),
  errors: window.__errors.slice(0, 3),
}));
console.log(variante || "(basis)", JSON.stringify(info));
await page.screenshot({ path: `/tmp/ghq-repro${variante.replaceAll(/[?&=]/g, "_")}.png` });
await browser.close();
