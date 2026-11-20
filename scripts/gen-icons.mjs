/**
 * Generiert die PWA-Icons und das Favicon aus der Bildmarke von Garmin Hub
 * (Puls-Linie in Salbei auf Navy — wie components/logo.tsx). Rendert das SVG
 * mit dem lokal installierten Google Chrome über Playwright (devDependency).
 *
 *   node scripts/gen-icons.mjs
 *
 * Das Favicon (.ico) entsteht auf macOS mit `sips`; anderswo bleibt
 * app/favicon.ico unverändert.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");

function svg(groesse, anteil) {
  const box = 512 * anteil;
  const versatz = (512 - box) / 2;
  const skala = box / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${groesse}" height="${groesse}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#151b26"/>
  <g transform="translate(${versatz} ${versatz}) scale(${skala})">
    <path d="M2.5 13.5h4l2.5-6 4 11 3-8.5h5.5" fill="none" stroke="#a4b99a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g></svg>`;
}

const tmp = mkdtempSync(path.join(tmpdir(), "garmin-hub-icons-"));
const ziele = [
  [path.join(ROOT, "public/icons/icon-512.png"), 512, 0.62],
  [path.join(ROOT, "public/icons/icon-192.png"), 192, 0.62],
  [path.join(ROOT, "public/icons/apple-touch-icon.png"), 180, 0.62],
  // maskable: Motiv innerhalb der sicheren Zone (inneres 80-%-Kreis)
  [path.join(ROOT, "public/icons/icon-maskable-512.png"), 512, 0.5],
  [path.join(tmp, "favicon-48.png"), 48, 0.7],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const seite = await browser.newPage({ deviceScaleFactor: 1 });
for (const [datei, groesse, anteil] of ziele) {
  await seite.setViewportSize({ width: groesse, height: groesse });
  await seite.setContent(`<html><body style="margin:0">${svg(groesse, anteil)}</body></html>`);
  await seite.screenshot({ path: datei, clip: { x: 0, y: 0, width: groesse, height: groesse } });
  console.log("geschrieben:", path.relative(ROOT, datei));
}
await browser.close();

try {
  execFileSync("sips", ["-s", "format", "ico", path.join(tmp, "favicon-48.png"), "--out", path.join(ROOT, "app/favicon.ico")]);
  console.log("geschrieben: app/favicon.ico");
} catch {
  console.log("sips nicht verfügbar — app/favicon.ico bleibt unverändert");
}
