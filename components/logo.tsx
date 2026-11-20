import { cn } from "@/lib/utils";

/**
 * Bildmarke von Garmin Hub: Puls-Linie in Salbei auf ruhiger Fläche.
 * Rein dekorativ (aria-hidden).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary", className)}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[62%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 13.5h4l2.5-6 4 11 3-8.5h5.5" />
      </svg>
    </span>
  );
}
