import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Saira_Condensed } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SwRegister } from "@/components/sw-register";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const display = Saira_Condensed({
  variable: "--font-display",
  weight: ["500", "600", "700"],
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
  themeColor: "#10151d",
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
      className={`dark ${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body className="antialiased">
        <AppShell>{children}</AppShell>
        <SwRegister />
      </body>
    </html>
  );
}
