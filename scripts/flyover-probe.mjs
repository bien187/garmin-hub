import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 250)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 250)));
await page.goto("https://garmin-hub.vercel.app/login");
await page.fill("input[type=password]", process.env.APP_PW);
await page.click("button[type=submit]");
await page.waitForTimeout(4000);
await page.goto("https://garmin-hub.vercel.app/activities/23572376914", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(10000);
const vorher = await page.evaluate(() => {
  const m = window.__ghqMap;
  const gl = m.getCanvas().getContext("webgl2") || m.getCanvas().getContext("webgl");
  return { zoom: +m.getZoom().toFixed(2), pitch: m.getPitch(), kontextVerloren: gl ? gl.isContextLost() : null, geladen: m.loaded() };
});
console.log("vor Play:", JSON.stringify(vorher));
await page.getByRole("button", { name: /Flyover/ }).click();
await page.waitForTimeout(6000);
const nachher = await page.evaluate(() => {
  const m = window.__ghqMap;
  const gl = m.getCanvas().getContext("webgl2") || m.getCanvas().getContext("webgl");
  const c = m.getCenter();
  return {
    zoom: +m.getZoom().toFixed(2), pitch: m.getPitch(), bearing: Math.round(m.getBearing()),
    center: [+c.lng.toFixed(4), +c.lat.toFixed(4)],
    kontextVerloren: gl ? gl.isContextLost() : null,
    terrain: Boolean(m.getTerrain()),
    layerSichtbar: m.getLayer("route-linie") ? m.getLayoutProperty("route-linie", "visibility") ?? "visible" : "fehlt",
    repaint: m.repaint,
  };
});
console.log("nach Play:", JSON.stringify(nachher));
await browser.close();
