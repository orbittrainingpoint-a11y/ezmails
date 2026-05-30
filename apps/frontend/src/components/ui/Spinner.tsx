import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-primary", className)} aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-base">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
