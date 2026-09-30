'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Aktualisiert gespeicherte Daten auch beim Zurückkehren und über Mitternacht. */
export function DashboardAktuell() {
  const router=useRouter();
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible') router.refresh();};
    const timer=window.setInterval(refresh,60_000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('benchmarks-changed',refresh);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('benchmarks-changed',refresh);};
  },[router]);
  return null;
}
