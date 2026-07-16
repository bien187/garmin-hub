import { NextResponse } from "next/server";
import { ladeProfil } from "@/lib/profile";
import { ladeLaufModell } from "@/lib/server/ep-service";
import { trainingsPaces } from "@/lib/engine/paces";

/** GET /api/model — aktuelles Lauf-Leistungsmodell für Client-Schätzungen */
export async function GET() {
  try {
    const [profil, modell] = await Promise.all([ladeProfil(), ladeLaufModell()]);
    const fuenfKmS = modell?.fuenfKmS ?? null;
    // Fallback: Bens bekannte 10 km in 5:56/km → Riegel ≈ 5:47/km auf 5 km
    const basis = fuenfKmS ?? 5 * 347;
    const paces = trainingsPaces(basis);
    return NextResponse.json({
      fuenfKmS,
      istFallback: fuenfKmS == null,
      paces,
      profil: {
        gewichtKg: profil.gewichtKg,
        ruhepuls: profil.ruhepuls,
        hfMax: profil.hfMax,
      },
    });
  } catch {
    const paces = trainingsPaces(5 * 347);
    return NextResponse.json({ fuenfKmS: null, istFallback: true, paces, profil: null });
  }
}
