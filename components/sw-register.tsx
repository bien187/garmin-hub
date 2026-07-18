"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }
    // Registrierung vom kritischen Navigationspfad fernhalten: erst nach
    // window.load + Verzögerung (Safari bricht sonst laufende Router-
    // Fetches beim SW-Wechsel ab)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const registriere = () => {
      timer = setTimeout(() => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }, 3000);
    };
    if (document.readyState === "complete") {
      registriere();
    } else {
      window.addEventListener("load", registriere, { once: true });
    }
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("load", registriere);
    };
  }, []);
  return null;
}
