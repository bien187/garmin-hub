/* Verifikation: Graph-Position, Kamera-Glattheit, Zoom im Flug, Mobile-Layout */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "https://garmin-hub.vercel.app";
const PW = process.env.APP_PW;
const AID = process.env.AID ?? "23572376914";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill("input[type=password]", PW);
  await page.click("button[type=submit]");
  await page.waitForTimeout(4000);
}

/* ---------- Desktop: Flyover ---------- */
const desktop = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await desktop.newPage();
const fehler = [];
page.on("pageerror", (e) => fehler.push(`[pageerror] ${String(e).slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error") fehler.push(`[console] ${m.text().slice(0, 200)}`);
});

await login(page);
await page.goto(`${BASE}/activities/${AID}`, { waitUntil: "domcontentloaded" });

// Warten bis Vorladen fertig (Play-Button aktiv)
const play = page.getByRole("button", { name: /Flyover|Lädt/ });
await play.waitFor({ timeout: 40000 });
for (let i = 0; i < 40; i++) {
  if (await play.isEnabled()) break;
  await page.waitForTimeout(1000);
}
console.log("Play-Button aktiv:", await play.isEnabled());

/* Geometrie: liegt der Graph UNTER der Karte? */
const geo = await page.evaluate(() => {
  const map = document.querySelector(".maplibregl-map")?.getBoundingClientRect();
  const canvases = [...document.querySelectorAll("canvas")].filter(
    (c) => !c.classList.contains("maplibregl-canvas")
  );
  const graph = canvases[0]?.getBoundingClientRect();
  return {
    karteUnten: map ? Math.round(map.bottom) : null,
    graphOben: graph ? Math.round(graph.top) : null,
    graphHoehe: graph ? Math.round(graph.height) : null,
    graphBreite: graph ? Math.round(graph.width) : null,
  };
});
console.log("Geometrie:", JSON.stringify(geo));
console.log(
  "→ Graph unter der Karte:",
  geo.graphOben != null && geo.karteUnten != null && geo.graphOben >= geo.karteUnten - 2
);

/* Kamera-Glattheit: bearing/zoom über Frames sampeln */
await page.evaluate(() => {
  window.__cam = [];
  const map = window.__ghqMap;
  if (!map) return;
  const tick = () => {
    window.__cam.push({
      b: map.getBearing(),
      z: map.getZoom(),
      c: map.getCenter().toArray(),
    });
    if (window.__cam.length < 400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await play.click();
await page.waitForTimeout(6000);

const glatt = await page.evaluate(() => {
  const cam = window.__cam ?? [];
  if (cam.length < 30) return { samples: cam.length };
  const dBear = [];
  const dZoom = [];
  for (let i = 1; i < cam.length; i++) {
    let d = cam[i].b - cam[i - 1].b;
    d = ((d + 540) % 360) - 180;
    dBear.push(Math.abs(d));
    dZoom.push(Math.abs(cam[i].z - cam[i - 1].z));
  }
  const max = (a) => Math.max(...a);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    samples: cam.length,
    bearingMaxProFrame: +max(dBear).toFixed(3),
    bearingAvgProFrame: +avg(dBear).toFixed(3),
    zoomMaxProFrame: +max(dZoom).toFixed(4),
  };
});
console.log("Kamera-Glattheit:", JSON.stringify(glatt));

/* Zoom während des Flugs: +-Button klicken, prüfen ob Zoom höher bleibt */
const zoomVor = await page.evaluate(() => window.__ghqMap?.getZoom() ?? null);
await page.click(".maplibregl-ctrl-zoom-in");
await page.waitForTimeout(300);
await page.click(".maplibregl-ctrl-zoom-in");
await page.waitForTimeout(2500);
const zoomNach = await page.evaluate(() => window.__ghqMap?.getZoom() ?? null);
console.log(
  `Zoom im Flug: ${zoomVor?.toFixed(2)} → ${zoomNach?.toFixed(2)} (bleibt erhöht: ${
    zoomNach != null && zoomVor != null && zoomNach > zoomVor + 0.5
  })`
);

await page.screenshot({ path: "/tmp/ghq-verify-flyover.png", fullPage: false });
console.log("Fehler:", fehler.length ? fehler.slice(0, 5).join(" | ") : "keine");

/* ---------- Mobile-Layout ---------- */
const mobil = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mp = await mobil.newPage();
await login(mp);
for (const pfad of ["/", "/body", "/plan"]) {
  await mp.goto(`${BASE}${pfad}`, { waitUntil: "domcontentloaded" });
  await mp.waitForTimeout(3500);
  const l = await mp.evaluate(() => {
    const nav = document.querySelector("nav.fixed");
    const r = nav?.getBoundingClientRect();
    return {
      seiteScrollt: document.documentElement.scrollHeight > window.innerHeight + 2,
      navSichtbar: r ? Math.round(r.bottom) <= window.innerHeight + 1 : false,
      innererScroller: Boolean(document.getElementById("app-scroll")),
    };
  });
  console.log(`${pfad}:`, JSON.stringify(l));
  await mp.screenshot({ path: `/tmp/ghq-mobil${pfad.replaceAll("/", "_") || "_home"}.png` });
}

await browser.close();
