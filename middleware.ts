import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, sessionCookie } from "@/lib/auth";

// Öffentlich: Login, Auth-Endpoint, Cron (eigener CRON_SECRET-Check) und
// die Python-Bridge (eigener x-internal-key-Check — Server-zu-Server-Aufruf
// ohne Session-Cookie).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/cron", "/api/bridge"];

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
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://s3.amazonaws.com",
  "font-src 'self' data: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org https://s3.amazonaws.com https://brouter.de",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

function mitCsp(res: NextResponse): NextResponse {
  res.headers.set("Content-Security-Policy", CSP);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return mitCsp(NextResponse.next());
  }

  const token = req.cookies.get(sessionCookie.name)?.value;
  if (token && (await verifySessionToken(token))) {
    return mitCsp(NextResponse.next());
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
