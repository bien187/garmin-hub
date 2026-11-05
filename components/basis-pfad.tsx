"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, type ComponentProps } from "react";
import { DEMO_BASIS, mitBasis } from "@/lib/demo/pfade";

/**
 * Basis-Pfad der App: "" in der regulären App, "/demo" in der öffentlichen
 * Demo. Gesetzt von der AppShell anhand des Pfads; geteilte Komponenten
 * bauen interne Links über `useAppPfad()` bzw. `AppLink`, damit die Demo
 * nie auf Seiten der regulären App verlinkt.
 */
const BasisPfadContext = createContext("");

export function BasisPfadProvider({ basis, children }: { basis: string; children: React.ReactNode }) {
  return <BasisPfadContext.Provider value={basis}>{children}</BasisPfadContext.Provider>;
}

/** Liefert eine Funktion, die App-interne Pfade mit der aktuellen Basis versieht */
export function useAppPfad(): (href: string) => string {
  const basis = useContext(BasisPfadContext);
  return useCallback((href: string) => mitBasis(basis, href), [basis]);
}

/** true in der öffentlichen Demo: schreibende Aktionen ausblenden/deaktivieren */
export function useIstDemo(): boolean {
  return useContext(BasisPfadContext) === DEMO_BASIS;
}

/** Kurzer Hinweis neben deaktivierten Aktionen in der Demo */
export function DemoDeaktiviert({ className = "" }: { className?: string }) {
  return <p className={`text-xs text-muted-foreground ${className}`}>In der Demo deaktiviert.</p>;
}

/** next/link für App-interne Ziele (`href` als String ohne Basis) */
export function AppLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const pfad = useAppPfad();
  return <Link href={pfad(href)} {...rest} />;
}
