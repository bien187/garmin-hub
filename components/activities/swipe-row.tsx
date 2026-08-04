"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Wisch-nach-links-Zeile: legt hinter dem Inhalt eine „Löschen"-Aktion frei.
 * Tippen navigiert (Kind bleibt Link), horizontales Wischen enthüllt die
 * Aktion, ohne den vertikalen Seiten-Scroll zu blockieren.
 */
export function SwipeRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0); // aktuelle Verschiebung (px, ≤0)
  const startX = useRef(0);
  const startY = useRef(0);
  const basis = useRef(0);
  const richtung = useRef<"?" | "h" | "v">("?");
  const REVEAL = 88;

  return (
    <div className="relative overflow-hidden">
      {/* Aktion dahinter */}
      <button
        onClick={onDelete}
        aria-label="Aktivität löschen"
        className="absolute inset-y-0 right-0 flex w-22 items-center justify-center gap-1 bg-status-red/15 text-sm font-medium text-status-red"
        style={{ opacity: offset < -8 ? 1 : 0 }}
      >
        <Trash2 className="size-4" />
        Löschen
      </button>
      {/* Inhalt darüber, verschiebbar */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: richtung.current === "?" ? "transform 0.2s ease-out" : "none",
          touchAction: "pan-y",
        }}
        onPointerDown={(e) => {
          startX.current = e.clientX;
          startY.current = e.clientY;
          basis.current = offset;
          richtung.current = "?";
        }}
        onPointerMove={(e) => {
          if (e.pressure === 0 && e.pointerType === "mouse") return;
          const dx = e.clientX - startX.current;
          const dy = e.clientY - startY.current;
          if (richtung.current === "?") {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            richtung.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
          }
          if (richtung.current !== "h") return;
          const next = Math.min(0, Math.max(-REVEAL - 20, basis.current + dx));
          setOffset(next);
        }}
        onPointerUp={() => {
          const auf = richtung.current === "h";
          richtung.current = "?";
          if (!auf) return;
          setOffset(offset < -REVEAL / 2 ? -REVEAL : 0);
        }}
        onPointerCancel={() => {
          richtung.current = "?";
          setOffset(0);
        }}
        // Tap-Navigation nur zulassen, wenn nicht offen (sonst schliessen)
        onClickCapture={(e) => {
          if (offset < -8) {
            e.preventDefault();
            e.stopPropagation();
            setOffset(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
