import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LoginSchema = z.object({ passwort: z.string().min(1).max(200) }).strict();

/** Zeitkonstanter Vergleich über SHA-256 (gleiche Länge, kein Längen-Leak) */
function passwortStimmt(eingabe: string, erwartet: string): boolean {
  const a = createHash("sha256").update(eingabe).digest();
  const b = createHash("sha256").update(erwartet).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Brute-Force-Schutz: 8 Versuche pro 15 Minuten
  const limit = await rateLimit("login", { max: 8, windowSec: 900 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterS);

  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  const erwartet = process.env.APP_PASSWORD;

  if (!parsed.success || !erwartet || !passwortStimmt(parsed.data.passwort, erwartet)) {
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return res;
}
