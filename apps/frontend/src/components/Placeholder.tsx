import { Construction } from "lucide-react";

/** Temporary page for routes whose feature lands in a later build phase. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface py-20 text-center">
        <Construction className="mb-3 h-8 w-8 text-text-secondary" />
        <p className="text-sm text-text-secondary">This screen is coming in a later build phase.</p>
      </div>
    </div>
  );
}
