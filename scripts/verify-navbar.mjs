/**
 * Misst die Tab-Bar auf iPhone-Massen (393 × 852, 3x).
 *
 * Geprüft werden die beiden Dinge, an denen es zweimal gescheitert ist:
 *  1. Sitzt die Leiste bündig am Viewport-Unterrand (keine Lücke darunter,
 *     die im Dunkelmodus wie zusätzliche Leistenhöhe aussieht)?
 *  2. Wie hoch ist sie wirklich — inklusive Freihaltung für den
 *     Home-Indikator?
 *
 * Aufruf: node scripts/verify-navbar.mjs [basisUrl] [passwort]
 */
/* Chromium statt WebKit: die App sendet HSTS, und WebKit erzwingt daraufhin
   auch auf localhost https — sämtliche Stylesheets scheitern dann am TLS
   und man misst eine Seite ohne CSS. */
import { chromium } from "playwright";
import fs from "node:fs";

const basis = process.argv[2] ?? "http://localhost:3000";
const passwort =
  process.argv[3] ??
  (fs.existsSync(".env.local")
    ? (fs
        .readFileSync(".env.local", "utf8")
        .split("\n")
        .find((l) => l.startsWith("APP_PASSWORD=")) ?? "")
        .slice("APP_PASSWORD=".length)
        .trim()
    : "");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 }, // iPhone 15 Pro in CSS-Pixeln
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
const p = await ctx.newPage();
const fehler = [];
p.on("pageerror", (e) => fehler.push(String(e).slice(0, 160)));

/** WebKit meldet im Test keine echten Safe-Area-Insets — iPhone-Werte setzen */
async function insets() {
  await p.addStyleTag({
    content: ":root{--sat:59px!important;--sab:34px!important}",
  });
}

// Anmeldung über die API statt über das Formular: der Cookie landet im
// selben Kontext, und die Messung hängt nicht an der Hydration.
const login = await ctx.request.post(`${basis}/api/auth/login`, {
  data: { passwort },
});
if (!login.ok()) {
  console.error("Anmeldung fehlgeschlagen:", login.status(), await login.text());
  await browser.close();
  process.exit(1);
}

for (const pfad of ["/", "/activities", "/plan", "/body"]) {
  await p.goto(basis + pfad, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  await insets();
  await p.waitForTimeout(200);

  const r = await p.evaluate(() => {
    // Neue Fassung trägt .nav-bar; ältere Stände sind die letzte <nav> im DOM
    const nav =
      document.querySelector("nav.nav-bar") ??
      [...document.querySelectorAll("nav")].pop();
    if (!nav) return { keineNav: true };
    const b = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const wurzel = getComputedStyle(document.documentElement);
    const inhalt = nav.firstElementChild?.getBoundingClientRect();
    const link = nav.querySelector("a")?.getBoundingClientRect();
    return {
      innerH: window.innerHeight,
      navTop: Math.round(b.top),
      navBottom: Math.round(b.bottom),
      navHoehe: Math.round(b.height),
      luecke: Math.round(window.innerHeight - b.bottom),
      padUnten: cs.paddingBottom,
      inhaltHoehe: inhalt ? Math.round(inhalt.height) : null,
      tapHoehe: link ? Math.round(link.height) : null,
      navH: wurzel.getPropertyValue("--nav-h").trim(),
      position: cs.position,
    };
  });

  if (r.keineNav) {
    console.log(`${pfad.padEnd(13)} keine Navigationsleiste gefunden`);
    continue;
  }
  const buendig = r.luecke === 0;
  console.log(
    `${pfad.padEnd(13)} Höhe ${String(r.navHoehe).padStart(3)} px ` +
      `(Inhalt ${r.inhaltHoehe}, Tap ${r.tapHoehe}, Freihaltung ${r.padUnten}) · ` +
      `Unterkante ${r.navBottom}/${r.innerH} · ` +
      `${buendig ? "bündig ✓" : `LÜCKE ${r.luecke} px ✗`} · ${r.position}`
  );
  await p.screenshot({ path: `/tmp/ghq-nav${pfad.replaceAll("/", "_") || "_home"}.png` });
}

console.log("Seitenfehler:", fehler.length ? fehler.slice(0, 3).join(" | ") : "keine");
await browser.close();
