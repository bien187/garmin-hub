import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Narrow } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SwRegister } from "@/components/sw-register";

// Eine Superfamilie in zwei Breiten (Landeskarten-Charakter):
// Archivo für Fliesstext/UI, Archivo Narrow für Zahlen + Micro-Labels.
const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
});

const narrow = Archivo_Narrow({
  variable: "--font-narrow",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Garmin Hub",
    template: "%s · Garmin Hub",
  },
  description:
    "Persönliches Trainings-HQ für die Eignungsprüfung der Schweizer Armee-Grenadiere.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Garmin Hub",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1318",
  width: "device-width",
  initialScale: 1,
  // Pinch-Zoom erlaubt (Barrierefreiheit) — Eingabefelder sind 16px, damit
  // iOS beim Fokussieren nicht auto-zoomt.
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de-CH"
      className={`dark ${sans.variable} ${narrow.variable}`}
    >
      <body className="antialiased">
        <AppShell>{children}</AppShell>
        <SwRegister />
      </body>
    </html>
  );
}
