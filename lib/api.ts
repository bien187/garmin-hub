import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySessionToken, sessionCookie } from "@/lib/auth";

/**
 * Handler-seitige Session-Prüfung (Defense in Depth zusätzlich zur
 * Middleware). Liefert null bei gültiger Session, sonst eine 401-Antwort.
 */
export async function requireSession(): Promise<NextResponse | null> {
  const token = (await cookies()).get(sessionCookie.name)?.value;
  if (token && (await verifySessionToken(token))) return null;
  return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
}

/**
 * Body gegen ein zod-Schema parsen. Bei Fehler wird eine 400-Antwort
 * zurückgegeben (statt eines Datensatzes), sonst die typisierten Daten.
 */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S
): Promise<{ data: z.infer<S>; error: null } | { data: null; error: NextResponse }> {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { data: parsed.data, error: null };
}
