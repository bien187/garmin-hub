import { decodePolyline } from "@/lib/geo/polyline";

/** Statische Mini-Karte einer Aktivität als SVG-Pfad (kein Karten-Request) */
export function PolylineSvg({
  encoded,
  className,
}: {
  encoded: string | null;
  className?: string;
}) {
  if (!encoded) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-muted/60 text-[10px] text-muted-foreground ${className ?? ""}`}
      >
        ohne GPS
      </div>
    );
  }
  const punkte = decodePolyline(encoded);
  if (punkte.length < 2) return <div className={className} />;

  const lats = punkte.map((p) => p[0]);
  const lngs = punkte.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Mercator-Näherung: Längengrad mit cos(Breite) stauchen
  const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const breite = Math.max((maxLng - minLng) * cosLat, 1e-6);
  const hoehe = Math.max(maxLat - minLat, 1e-6);
  const skala = 92 / Math.max(breite, hoehe);
  const dx = (100 - breite * skala) / 2;
  const dy = (100 - hoehe * skala) / 2;

  const d = punkte
    .map((p, i) => {
      const x = (p[1] - minLng) * cosLat * skala + dx;
      const y = 100 - ((p[0] - minLat) * skala + dy);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");

  return (
    <svg viewBox="0 0 100 100" className={`rounded-md bg-muted/60 ${className ?? ""}`}>
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
