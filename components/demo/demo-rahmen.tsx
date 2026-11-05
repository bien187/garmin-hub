"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { DemoApi, type DemoKern } from "@/lib/demo/api";
import { installiereDemoFetch } from "@/lib/demo/fetch";
import { DEMO_DATEN_PFAD, DEMO_HINWEIS, portfolioUrl } from "@/lib/demo/konstanten";
import { ohneBasis } from "@/lib/demo/pfade";
import { formatDatumLang, setzeUhrVersatz } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

const DemoContext = createContext<DemoApi | null>(null);

/** Demo-Zustand (nur innerhalb von /demo verfügbar) */
export function useDemo(): DemoApi {
  const api = useContext(DemoContext);
  if (!api) throw new Error("useDemo ausserhalb des Demo-Rahmens");
  return api;
}

/**
 * Rahmen der öffentlichen Demo:
 *  1. lädt den fiktiven Datenstand (public/demo/daten/kern.json),
 *  2. leitet /api-Aufrufe der App-Komponenten an die Demo-API im Browser um
 *     (kein Request erreicht einen echten Endpunkt),
 *  3. stellt die App-Uhr auf den Demo-Stand (Do 05.11.2026, Abend).
 * Erst danach werden die Seiten gerendert — deshalb rendert der Server hier
 * nur ein Skelett und nie Demo- oder echte Daten.
 * Beim Verlassen werden fetch und Uhr wiederhergestellt.
 */
export function DemoRahmen({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<DemoApi | null>(null);
  const [fehler, setFehler] = useState(false);
  const vollbild = ohneBasis(usePathname()) === "/map";

  useEffect(() => {
    let aktiv = true;
    let aufraeumen: (() => void) | null = null;
    const echtesFetch = window.fetch.bind(window);
    const cache = new Map<string, Promise<unknown>>();
    const lade = (pfad: string) => {
      if (!cache.has(pfad)) {
        cache.set(
          pfad,
          echtesFetch(`${DEMO_DATEN_PFAD}/${pfad}`).then((r) => {
            if (!r.ok) throw new Error(`Demo-Datei fehlt: ${pfad}`);
            return r.json();
          })
        );
      }
      return cache.get(pfad)!;
    };
    lade("kern.json")
      .then((kern) => {
        if (!aktiv) return;
        const demo = new DemoApi(kern as DemoKern, lade);
        setzeUhrVersatz(Date.parse(demo.kern.jetzt) - Date.now());
        const fetchZurueck = installiereDemoFetch(demo, echtesFetch);
        aufraeumen = () => {
          fetchZurueck();
          setzeUhrVersatz(0);
        };
        setApi(demo);
      })
      .catch(() => aktiv && setFehler(true));
    return () => {
      aktiv = false;
      aufraeumen?.();
    };
  }, []);

  return (
    <DemoContext.Provider value={api}>
      <div className={vollbild ? "flex h-full flex-col" : undefined}>
        <DemoHinweis heute={api?.kern.heute ?? null} />
        <div className={vollbild ? "relative min-h-0 flex-1" : undefined}>
          {api ? children : fehler ? <DemoFehler /> : <DemoLaedt />}
        </div>
      </div>
    </DemoContext.Provider>
  );
}

/** Dezenter Hinweis oben auf jeder Demo-Seite */
function DemoHinweis({ heute }: { heute: string | null }) {
  const portfolio = portfolioUrl();
  return (
    <div
      role="note"
      className="flex items-center gap-x-3 border-b border-primary/20 bg-primary/5 px-4 text-xs text-muted-foreground md:px-6"
    >
      <FlaskConical className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 py-2">
        {DEMO_HINWEIS}
        {heute && <span className="text-dim-foreground"> Stand {formatDatumLang(heute)}.</span>}
      </span>
      {portfolio && (
        <a
          href={portfolio}
          className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary underline-offset-2 hover:underline"
        >
          Zum Portfolio
        </a>
      )}
    </div>
  );
}

function DemoLaedt() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6" aria-busy aria-label="Demo wird geladen">
      <Skeleton className="h-16 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48 lg:col-span-2" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48 lg:col-span-2" />
      </div>
    </div>
  );
}

function DemoFehler() {
  return (
    <div className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">
      Die Demo-Daten konnten nicht geladen werden. Bitte die Seite neu laden.
    </div>
  );
}
