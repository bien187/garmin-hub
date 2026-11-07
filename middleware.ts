import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, sessionCookie } from "@/lib/auth";
import { istOeffentlicherPfad } from "@/lib/oeffentliche-pfade";
import { istDemoPfad } from "@/lib/demo/pfade";

/**
 * Content-Security-Policy.
 *
 * script-src erlaubt 'unsafe-inline' (in Prod ohne 'unsafe-eval'): Next.js
 * bettet auf statisch vorgerenderten Seiten Inline-Bootstrap-Skripte OHNE
 * Nonce ein. Ein nonce-/strict-dynamic-Ansatz würde app-weit erzwungenes
 * dynamisches Rendering verlangen und die Mobile-TTFB verschlechtern.
 * Da die App keinen XSS-Sink hat (kein dangerouslySetInnerHTML, kein
 * gerendertes User-HTML), ist das Rest-Risiko von 'unsafe-inline' minimal;
 * alle anderen Direktiven bleiben streng (kein externes Skript, kein eval
 * in Prod, kein Framing, connect/img/font auf Allowlist).
 */
/** Raster-Kartentypen aus lib/geo/map-style.ts (Satellit: Esri, Topo CH: swisstopo) */
const KARTEN_RASTER = "https://server.arcgisonline.com https://wmts.geo.admin.ch";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://tiles.openfreemap.org https://s3.amazonaws.com ${KARTEN_RASTER}`,
  "font-src 'self' data: https://tiles.openfreemap.org",
  `connect-src 'self' https://tiles.openfreemap.org https://s3.amazonaws.com ${KARTEN_RASTER} https://brouter.de`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

function mitCsp(res: NextResponse): NextResponse {
  res.headers.set("Content-Security-Policy", CSP);
  return res;
}

/**
 * Eingehende Header, die nach Demo-Umschaltung aussehen (x-demo, x-ghq-demo …),
 * werden verworfen: Ob eine Anfrage zur Demo gehört, entscheidet allein der
 * Pfad hier auf dem Server, nie ein Wert vom Client.
 */
function ohneDemoHeader(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  for (const name of [...headers.keys()]) {
    if (/^x-(ghq-)?demo/i.test(name)) headers.delete(name);
  }
  return headers;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const weiter = () => NextResponse.next({ request: { headers: ohneDemoHeader(req) } });

  // Öffentliche Demo: nur lesend (statische Seiten und Dateien)
  if (istDemoPfad(pathname) && req.method !== "GET" && req.method !== "HEAD") {
    return mitCsp(
      NextResponse.json({ error: "In der Demo deaktiviert." }, { status: 405, headers: { Allow: "GET, HEAD" } })
    );
  }

  if (istOeffentlicherPfad(pathname)) {
    return mitCsp(weiter());
  }

  const token = req.cookies.get(sessionCookie.name)?.value;
  if (token && (await verifySessionToken(token))) {
    return mitCsp(weiter());
  }

  if (pathname.startsWith("/api/")) {
    return mitCsp(NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }));
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("von", pathname);
  return mitCsp(NextResponse.redirect(loginUrl));
}

export const config = {
  // Alles schützen ausser statischen Assets und PWA-Dateien
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)",
  ],
};
