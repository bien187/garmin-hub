"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Wisch-nach-links-Zeile (§5.1): legt eine 88px-„Löschen"-Aktion frei.
 * Tippen navigiert (Kind bleibt Link), horizontales Wischen enthüllt die
 * Aktion mit Widerstand hinter −88px; `collapsed` kollabiert die Zeile
 * (Höhe 60→0) nach bestätigtem Löschen.
 */
export function SwipeRow({
  children,
  onDelete,
  collapsed = false,
  deaktiviert = false,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  collapsed?: boolean;
  /** Demo: kein Wischen, keine Löschen-Aktion */
  deaktiviert?: boolean;
}) {
  const [offset, setOffset] = useState(0); // aktuelle Verschiebung (px, ≤0)
  const startX = useRef(0);
  const startY = useRef(0);
  const basis = useRef(0);
  const richtung = useRef<"?" | "h" | "v">("?");
  const REVEAL = 88;

  if (deaktiviert) return <div className="h-15 overflow-hidden">{children}</div>;

  return (
    <div
      className="overflow-hidden"
      style={{
        height: collapsed ? 0 : 60,
        opacity: collapsed ? 0 : 1,
        transition: "height var(--dur-base) var(--ease-base), opacity var(--dur-base) var(--ease-base)",
      }}
    >
      <div className="relative h-15 overflow-hidden">
        {/* Aktion dahinter */}
        <button
          onClick={onDelete}
          aria-label="Aktivität löschen"
          className="absolute inset-y-0 right-0 flex w-22 flex-col items-center justify-center gap-0.5 bg-status-red/15 text-[11px] font-medium text-status-red"
          style={{ opacity: offset < -8 ? 1 : 0 }}
        >
          <Trash2 className="size-4" />
          Löschen
        </button>
        {/* Inhalt darüber, verschiebbar */}
        <div
          className="h-full bg-background"
          style={{
            transform: `translateX(${offset}px)`,
            transition:
              richtung.current === "?"
                ? "transform var(--dur-base) var(--ease-base)"
                : "none",
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
            const roh = basis.current + dx;
            // Widerstand hinter −88px (×0.3), Klemme −112
            let next = roh;
            if (roh < -REVEAL) next = -REVEAL + (roh + REVEAL) * 0.3;
            next = Math.min(0, Math.max(-112, next));
            setOffset(next);
          }}
          onPointerUp={() => {
            const auf = richtung.current === "h";
            richtung.current = "?";
            if (!auf) return;
            setOffset(offset < -44 ? -REVEAL : 0);
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
    </div>
  );
}
