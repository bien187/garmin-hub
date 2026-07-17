import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, sessionCookie } from "@/lib/auth";

// Öffentlich: Login, Auth-Endpoint, Cron (eigener CRON_SECRET-Check) und
// die Python-Bridge (eigener x-internal-key-Check — Session-Cookies hat
// der Server-zu-Server-Aufruf nicht).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/cron", "/api/bridge"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(sessionCookie.name)?.value;
  if (token && (await verifySessionToken(token))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("von", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Alles schützen ausser statischen Assets und PWA-Dateien
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)",
  ],
};
