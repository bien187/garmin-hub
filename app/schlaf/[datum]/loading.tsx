import { Skeleton } from "@/components/ui/skeleton";

export default function Laden() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6" aria-busy>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>
  );
}
