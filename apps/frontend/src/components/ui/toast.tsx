import { create } from "zustand";
import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "info" | "success" | "danger";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper: `toast.success("Saved")`. */
export const toast = {
  info: (m: string) => useToastStore.getState().push(m, "info"),
  success: (m: string) => useToastStore.getState().push(m, "success"),
  error: (m: string) => useToastStore.getState().push(m, "danger"),
};

const icons = { info: Info, success: CheckCircle2, danger: AlertCircle };
const toneCls: Record<ToastTone, string> = {
  info: "border-primary/50",
  success: "border-success/50",
  danger: "border-danger/50",
};

/** Mount once near the app root. Announces toasts to screen readers. */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  useEffect(() => () => undefined, []);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2" aria-live="polite" role="status">
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-2 rounded-md border bg-elevated px-4 py-3 text-sm text-text-primary shadow-md",
              toneCls[t.tone],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-text-secondary hover:text-text-primary" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
