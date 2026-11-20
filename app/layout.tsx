import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SwRegister } from "@/components/sw-register";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Garmin Hub",
    template: "%s · Garmin Hub",
  },
  description:
    "Personal Fitness & Running Performance — dein persönliches Fitness-Cockpit mit Garmin-Daten, Trainingsplan und Fortschritt.",
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
  themeColor: "#151d2b",
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
      className={`dark ${sans.variable} ${mono.variable}`}
    >
      <body className="antialiased">
        <AppShell>{children}</AppShell>
        <SwRegister />
      </body>
    </html>
  );
}
