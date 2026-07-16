import { cn } from "@/lib/utils";

export interface ReadinessDaten {
  trainingReadiness: number | null;
  bodyBatteryMax: number | null;
  hrvStatus: string | null;
  hrvLetzteNacht: number | null;
  schlafScore: number | null;
  ruhepuls: number | null;
}

type Ampel = "gruen" | "gelb" | "rot" | "unbekannt";

function ampelFarbe(a: Ampel): string {
  switch (a) {
    case "gruen":
      return "bg-status-green";
    case "gelb":
      return "bg-status-yellow";
    case "rot":
      return "bg-status-red";
    default:
      return "bg-muted-foreground/40";
  }
}

function bewerte(d: ReadinessDaten): {
  gesamt: Ampel;
  satz: string;
  einzel: { label: string; wert: string; ampel: Ampel }[];
} {
  const einzel: { label: string; wert: string; ampel: Ampel }[] = [];

  const readinessAmpel: Ampel =
    d.trainingReadiness == null
      ? "unbekannt"
      : d.trainingReadiness >= 60
        ? "gruen"
        : d.trainingReadiness >= 35
          ? "gelb"
          : "rot";
  einzel.push({
    label: "Readiness",
    wert: d.trainingReadiness != null ? String(Math.round(d.trainingReadiness)) : "–",
    ampel: readinessAmpel,
  });

  const bbAmpel: Ampel =
    d.bodyBatteryMax == null
      ? "unbekannt"
      : d.bodyBatteryMax >= 70
        ? "gruen"
        : d.bodyBatteryMax >= 45
          ? "gelb"
          : "rot";
  einzel.push({
    label: "Body Battery",
    wert: d.bodyBatteryMax != null ? String(Math.round(d.bodyBatteryMax)) : "–",
    ampel: bbAmpel,
  });

  const hrvAmpel: Ampel =
    d.hrvStatus == null
      ? "unbekannt"
      : d.hrvStatus.toUpperCase() === "BALANCED"
        ? "gruen"
        : d.hrvStatus.toUpperCase() === "UNBALANCED"
          ? "gelb"
          : "rot";
  einzel.push({
    label: "HRV",
    wert: d.hrvLetzteNacht != null ? `${Math.round(d.hrvLetzteNacht)}` : "–",
    ampel: hrvAmpel,
  });

  const schlafAmpel: Ampel =
    d.schlafScore == null
      ? "unbekannt"
      : d.schlafScore >= 75
        ? "gruen"
        : d.schlafScore >= 55
          ? "gelb"
          : "rot";
  einzel.push({
    label: "Schlaf",
    wert: d.schlafScore != null ? String(Math.round(d.schlafScore)) : "–",
    ampel: schlafAmpel,
  });

  einzel.push({
    label: "Ruhepuls",
    wert: d.ruhepuls != null ? String(Math.round(d.ruhepuls)) : "–",
    ampel: "unbekannt",
  });

  const relevante = einzel.map((e) => e.ampel).filter((a) => a !== "unbekannt");
  const rot = relevante.filter((a) => a === "rot").length;
  const gelb = relevante.filter((a) => a === "gelb").length;
  let gesamt: Ampel = "unbekannt";
  let satz = "Noch keine Gesundheitsdaten — zuerst synchronisieren.";
  if (relevante.length > 0) {
    if (rot >= 2 || (rot >= 1 && gelb >= 2)) {
      gesamt = "rot";
      satz = "Rot: Heute Intervalle gegen Z2 tauschen oder Ruhetag vorziehen.";
    } else if (rot >= 1 || gelb >= 2) {
      gesamt = "gelb";
      satz = "Gelb: Locker trainieren geht — die harte Einheit besser verschieben.";
    } else {
      gesamt = "gruen";
      satz = "Grün: Heute ist der harte Tag des Plans machbar.";
    }
  }
  return { gesamt, satz, einzel };
}

export function ReadinessCard({ daten }: { daten: ReadinessDaten }) {
  const { gesamt, satz, einzel } = bewerte(daten);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={cn("size-3 shrink-0 rounded-full", ampelFarbe(gesamt))} />
        <p className="text-sm">{satz}</p>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {einzel.map((e) => (
          <div
            key={e.label}
            className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 px-1 py-2"
          >
            <span className={cn("size-1.5 rounded-full", ampelFarbe(e.ampel))} />
            <span className="stat-display text-lg leading-none">{e.wert}</span>
            <span className="text-center text-[9px] leading-tight text-muted-foreground">
              {e.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
