import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 600 } })).newPage();
const variante = process.argv[2] ?? "";
await page.goto(`file:///tmp/ghq-repro/repro2.html${variante}`);
await page.waitForTimeout(12000);
const info = await page.evaluate(() => ({
  zoom: window.__map.getZoom().toFixed(1),
  errors: window.__errors.slice(0, 2),
}));
console.log(variante || "(voll)", JSON.stringify(info));
await page.screenshot({ path: `/tmp/ghq-repro2${variante.replaceAll(/[?&=]/g, "_")}.png` });
await browser.close();
