import type { NextConfig } from "next";

/**
 * Statische Sicherheits-Header für alle Routen. Die Content-Security-Policy
 * wird NICHT hier gesetzt, sondern per-Request mit Nonce in middleware.ts
 * (nonce-basiertes script-src ist ohne 'unsafe-inline' nur dynamisch möglich).
 */
const sicherheitsHeader = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Kamera/Mikro aus; Geolocation nur same-origin (Ortungs-Button der Karte)
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  // Single-User-Trainings-App: nicht indexieren lassen
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // Keine Source-Maps im öffentlichen Prod-Bundle
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: sicherheitsHeader }];
  },
};

export default nextConfig;
