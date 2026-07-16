"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login-Seite ohne Navigation rendern
  if (pathname === "/login") return <>{children}</>;

  const fullBleed = pathname === "/map";

  return (
    <div className="flex min-h-dvh">
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

      {/* Content */}
      <main
        className={cn(
          "min-w-0 flex-1 md:ml-56",
          fullBleed ? "" : "pb-20 md:pb-8"
        )}
      >
        {children}
      </main>

      {/* Bottom-Tab-Bar (Mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur pb-safe md:hidden">
        <div className="grid grid-cols-5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
