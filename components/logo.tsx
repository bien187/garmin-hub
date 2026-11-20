import { cn } from "@/lib/utils";

/**
 * Bildmarke von Garmin Hub: Puls-Linie mit steigendem Ausschlag —
 * Navy auf Lime. Rein dekorativ (aria-hidden).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flaeche-lime flex shrink-0 items-center justify-center rounded-[30%] shadow-[0_8px_24px_-10px_rgb(184_243_107/70%)]",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[62%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 13.5h4l2.5-6 4 11 3-8.5h5.5" />
      </svg>
    </span>
  );
}
