"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mountain } from "lucide-react";
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
      router.replace(params.get("von") ?? "/");
      router.refresh();
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
        className="h-12 text-center"
      />
      {fehler && (
        <p className="text-center text-sm text-status-red">{fehler}</p>
      )}
      <Button type="submit" className="h-12 w-full" disabled={laden || !passwort}>
        {laden ? "Anmelden…" : "Anmelden"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3">
        <Mountain className="size-12 text-primary" strokeWidth={2.5} />
        <h1 className="stat-display text-3xl uppercase tracking-wider">
          Grenadier HQ
        </h1>
        <p className="text-sm text-muted-foreground">
          Bereit ist, wer vorbereitet ist.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
