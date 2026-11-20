"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laden, setLaden] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    setFehler(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwort }),
    });
    if (res.ok) {
      // Harte Navigation: Cookie-Wechsel + Safari bricht Router-Fetches
      // beim gleichzeitigen replace/refresh gerne ab
      window.location.replace(params.get("von") ?? "/");
    } else {
      setFehler("Falsches Passwort");
      setLaden(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4">
      <Input
        type="password"
        autoFocus
        placeholder="Passwort"
        value={passwort}
        onChange={(e) => setPasswort(e.target.value)}
        className="h-12 rounded-xl text-center"
      />
      {fehler && (
        <p className="text-center text-sm text-status-red">{fehler}</p>
      )}
      <Button type="submit" className="flaeche-lime h-12 w-full rounded-xl font-semibold" disabled={laden || !passwort}>
        {laden ? "Anmelden…" : "Anmelden"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flaeche-hero flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="size-16" />
        <h1 className="text-3xl font-semibold tracking-tight">Garmin Hub</h1>
        <p className="text-sm text-muted-foreground">Personal Fitness &amp; Running Performance</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
