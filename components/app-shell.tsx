"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck2, Footprints, Gauge, HeartPulse, Route, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/toast";
import { Logo } from "@/components/logo";
import { BasisPfadProvider } from "@/components/basis-pfad";
import { DEMO_BASIS, istDemoPfad, mitBasis, ohneBasis } from "@/lib/demo/pfade";

const TABS = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/activities", label: "Aktivitäten", icon: Footprints },
  { href: "/map", label: "Karte", icon: Route },
  { href: "/plan", label: "Plan", icon: CalendarCheck2 },
  { href: "/body", label: "Körper", icon: HeartPulse },
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

      // iOS-26-PWA: Im Standalone-Modus ist das Layout-Viewport um die
      // obere Safe-Area (Dynamic Island, 59 px) kürzer als der Bildschirm,
      // und WebKit zeichnet `position: fixed`-Inhalte unterhalb davon gar
      // nicht (dort sässe im Browser die Adressleiste). Die Navbar kann
      // also nicht tiefer — aber der Home-Indikator liegt dann ohnehin
      // ausserhalb der Seite, die Freihaltung unter den Labels entfällt.
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true;
      let luecke = false;
      if (standalone) {
        const hoch = window.innerHeight >= window.innerWidth;
        const bildschirm = hoch
          ? Math.max(screen.height, screen.width)
          : Math.min(screen.height, screen.width);
        const viewport = document.documentElement.clientHeight || h;
        const diff = Math.round(bildschirm - viewport);
        // Nur plausible Werte (Safe-Area-Grösse), nie bei offener Tastatur
        luecke = diff > 20 && diff <= 80;
      }
      document.documentElement.toggleAttribute("data-vp-luecke", luecke);
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
  const vollerPfad = usePathname();
  // Öffentliche Demo unter /demo: gleiche Shell, alle Links bleiben in /demo
  const demo = istDemoPfad(vollerPfad);
  const basis = demo ? DEMO_BASIS : "";
  const pathname = ohneBasis(vollerPfad);
  const ziel = (href: string) => mitBasis(basis, href);
  const tastaturOffen = useKeyboardOpen();
  useAppHeight();

  // Login-Seite ohne Navigation rendern
  if (!demo && pathname === "/login") return <>{children}</>;

  const fullBleed = pathname === "/map";

  // Fester App-Rahmen mit gemessener Höhe (`--app-h`), weil 100dvh im
  // iOS-Standalone die Bildschirmhöhe unterschätzt.
  //
  // Die Tab-Bar hängt NICHT mehr an dieser Höhe: sie ist `position: fixed`
  // am Viewport-Unterrand verankert. Vorher war sie das letzte Flex-Kind
  // des Rahmens und erbte damit jeden Messfehler — lag `--app-h` daneben,
  // stand unter ihr ein dunkles Band, das wie zusätzliche Leistenhöhe
  // aussah. Genau daran sind die beiden früheren Anläufe gescheitert.
  return (
    <BasisPfadProvider basis={basis}>
    <ToastProvider>
    <div
      className="fixed inset-x-0 top-0 flex overflow-hidden bg-background"
      style={{ height: "var(--app-h, 100dvh)" }}
    >
      {/* Sidebar (Desktop) */}
      <aside className="fixed inset-y-0 z-40 hidden md:flex md:w-56 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
        <Link href={ziel("/")} className="flex items-center gap-2.5 px-5 pt-6 pb-8">
          <Logo className="size-8" />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium tracking-tight">
              Garmin Hub
              {demo && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">Demo</span>}
            </span>
            <span className="block text-[11px] leading-tight text-muted-foreground">
              Personal Fitness &amp; Running Performance
            </span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {TABS.map(({ href, label, icon: Icon }) => {
            const aktiv = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={ziel(href)}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  aktiv ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("size-[18px]", aktiv && "text-primary")} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        {/* Einstellungen/Garmin-Verbindung gibt es in der Demo nicht */}
        {!demo && (
          <div className="px-3 pb-5">
            <Link
              href={ziel("/settings")}
              aria-current={isActive(pathname, "/settings") ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                isActive(pathname, "/settings") ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings className={cn("size-[18px]", isActive(pathname, "/settings") && "text-primary")} strokeWidth={1.8} />
              Einstellungen
            </Link>
          </div>
        )}
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

        {/* Bottom-Tab-Bar (Mobile) — bei offener Tastatur ausblenden.
            `fixed bottom-0` statt letztes Flex-Kind: die Position kommt
            damit vom Browser und nicht aus einer gemessenen Rahmenhöhe.
            Lag `--app-h` auch nur ein paar Pixel daneben, blieb darunter
            eine Lücke — im Dunkelmodus nicht als Lücke erkennbar, sondern
            als zu hohe Navigationsleiste. */}
        {!tastaturOffen && (
          <nav className="nav-bar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
            <div className="grid h-full grid-cols-5">
              {TABS.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={ziel(href)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-full flex-col items-center justify-center gap-1 text-[10px] leading-none transition-colors",
                      active ? "text-foreground" : "text-dim-foreground"
                    )}
                  >
                    <Icon className={cn("size-[19px]", active && "text-primary")} strokeWidth={active ? 2 : 1.7} />
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
    </BasisPfadProvider>
  );
}
