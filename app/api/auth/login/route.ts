import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { passwort } = await req.json().catch(() => ({ passwort: "" }));
  const erwartet = process.env.APP_PASSWORD;

  if (!erwartet || typeof passwort !== "string" || passwort !== erwartet) {
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return res;
}
