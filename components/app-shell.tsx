"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  CalendarRange,
  LayoutDashboard,
  Map as MapIcon,
  PersonStanding,
  Settings,
  Mountain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/toast";

const TABS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activities", label: "Aktivitäten", icon: Activity },
  { href: "/map", label: "Karte", icon: MapIcon },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/body", label: "Körper", icon: PersonStanding },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navbar nur ausblenden, wenn tatsächlich ein Textfeld fokussiert ist
 * (fokus-basiert statt Viewport-Heuristik — die löste im iOS-PWA-Standalone
 * falsch aus und konnte die Navbar unerwartet wegschieben).
 */
function useKeyboardOpen(): boolean {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    const pruefe = () => {
      const el = document.activeElement as HTMLElement | null;
      setOffen(
        !!el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.isContentEditable)
      );
    };
    document.addEventListener("focusin", pruefe);
    document.addEventListener("focusout", pruefe);
    return () => {
      document.removeEventListener("focusin", pruefe);
      document.removeEventListener("focusout", pruefe);
    };
  }, []);
  return offen;
}

/**
 * Echte sichtbare Höhe als CSS-Variable `--app-h`. Auf iOS-Standalone-PWA
 * unterschätzen 100dvh UND `position:fixed; inset:0` auf manchen Geräten die
 * Bildschirmhöhe (grosse Lücke unter der Navbar). `window.innerHeight` ist
 * der zuverlässigste Wert der wirklich gezeichneten Höhe.
 */
function useAppHeight() {
  useEffect(() => {
    const setzen = () => {
      const h = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight || 0,
        window.visualViewport?.height ?? 0
      );
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    setzen();
    window.addEventListener("resize", setzen);
    window.addEventListener("orientationchange", setzen);
    window.visualViewport?.addEventListener("resize", setzen);
    return () => {
      window.removeEventListener("resize", setzen);
      window.removeEventListener("orientationchange", setzen);
      window.visualViewport?.removeEventListener("resize", setzen);
    };
  }, []);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tastaturOffen = useKeyboardOpen();
  useAppHeight();

  // Login-Seite ohne Navigation rendern
  if (pathname === "/login") return <>{children}</>;

  const fullBleed = pathname === "/map";
  const aktiverIndex = TABS.findIndex((t) => isActive(pathname, t.href));

  // Fester App-Rahmen als `fixed inset-0` statt `h-dvh`: 100dvh unter-
  // meldet im iOS-PWA-Standalone auf manchen Geräten die echte Bildschirm-
  // höhe (Navbar schwebte dadurch weit über der Unterkante). `fixed inset-0`
  // entspricht exakt dem sichtbaren Viewport — die Navbar als letztes
  // Flex-Kind hugt damit garantiert die physische Unterkante.
  return (
    <ToastProvider>
    <div
      className="fixed inset-x-0 top-0 flex overflow-hidden bg-background"
      style={{ height: "var(--app-h, 100dvh)" }}
    >
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar fixed inset-y-0 z-40">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <Mountain className="size-6 text-primary" strokeWidth={2.5} />
          <span className="stat-display text-xl tracking-wide uppercase">
            Garmin Hub
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(pathname, href)
                  ? "bg-sidebar-accent text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(pathname, "/settings")
                ? "bg-sidebar-accent text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <Settings className="size-5" />
            Einstellungen
          </Link>
        </div>
      </aside>

      {/* Content-Spalte: Scrollbereich (flex-1) + Navbar (shrink-0) im Flow.
          Da der Rahmen `fixed inset-0` exakt den Viewport füllt, sitzt die
          Navbar als letztes Flex-Kind bündig an der physischen Unterkante. */}
      <main className="flex min-w-0 flex-1 flex-col md:ml-56">
        {fullBleed ? (
          <div className="min-h-0 flex-1">{children}</div>
        ) : (
          <div
            id="app-scroll"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-safe"
          >
            {children}
          </div>
        )}

        {/* Bottom-Tab-Bar (Mobile) — bei offener Tastatur ausblenden */}
        {!tastaturOffen && (
          <nav className="shrink-0 border-t border-border bg-sidebar/95 backdrop-blur pb-safe md:hidden">
            <div className="relative grid grid-cols-5">
              {/* Aktiv-Indikator: fährt per translateX zur aktiven Zelle (§6 Nr.1) */}
              {aktiverIndex >= 0 && (
                <div
                  className="pointer-events-none absolute top-0 left-0 h-0.5 w-1/5"
                  style={{
                    transform: `translateX(${aktiverIndex * 100}%)`,
                    transition: "transform var(--dur-base) var(--ease-base)",
                  }}
                >
                  <div className="mx-auto h-full w-8 rounded-full bg-primary" />
                </div>
              )}
              {TABS.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex min-h-9 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4.75" strokeWidth={active ? 2.5 : 2} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </main>
    </div>
    </ToastProvider>
  );
}
