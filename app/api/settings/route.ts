import { NextRequest, NextResponse } from "next/server";
import { ladeProfil, speichereProfil, Profil } from "@/lib/profile";
import { ladeGarminZonen } from "@/lib/server/zonen-service";
import { aktiveZonen } from "@/lib/hr-zonen";

export async function GET() {
  const profil = await ladeProfil();
  const garmin = await ladeGarminZonen();
  return NextResponse.json({
    profil,
    zonen: aktiveZonen(profil, garmin, "running"),
    zonenAktualisiert: garmin?.aktualisiert ?? null,
    zonenSportarten: garmin?.sportarten?.map((s) => s.sport) ?? [],
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<Profil> | null;
  if (!body) return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });

  const patch: Partial<Profil> = {};
  if (typeof body.hfMax === "number" && body.hfMax > 140 && body.hfMax < 230) {
    patch.hfMax = body.hfMax;
  }
  if (typeof body.ruhepuls === "number" && body.ruhepuls > 25 && body.ruhepuls < 100) {
    patch.ruhepuls = body.ruhepuls;
  }
  if (typeof body.gewichtKg === "number" && body.gewichtKg > 40 && body.gewichtKg < 160) {
    patch.gewichtKg = body.gewichtKg;
  }
  // epDatum wird nicht mehr angenommen (fixer Termin, lib/ep/konstanten.ts)
  if (
    typeof body.lastZuschlagSproKmPro10kg === "number" &&
    body.lastZuschlagSproKmPro10kg >= 3 &&
    body.lastZuschlagSproKmPro10kg <= 20
  ) {
    patch.lastZuschlagSproKmPro10kg = body.lastZuschlagSproKmPro10kg;
  }

  if (typeof body.wochenBudgetH === "number" && body.wochenBudgetH > 0 && body.wochenBudgetH <= 40) {
    patch.wochenBudgetH = Math.round(body.wochenBudgetH * 10) / 10;
  }

  const profil = await speichereProfil(patch);
  return NextResponse.json({ ok: true, profil });
}
