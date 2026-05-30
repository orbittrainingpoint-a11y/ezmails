import type { HTMLAttributes } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { cls: string; Icon: typeof Info }> = {
  info: { cls: "border-primary/40 text-text-primary", Icon: Info },
  success: { cls: "border-success/50 text-success", Icon: CheckCircle2 },
  warning: { cls: "border-warning/50 text-warning", Icon: TriangleAlert },
  danger: { cls: "border-danger/50 text-danger", Icon: AlertCircle },
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Alert({ tone = "info", className, children, ...props }: AlertProps) {
  const { cls, Icon } = tones[tone];
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-2 rounded-md border bg-elevated px-4 py-3 text-sm", cls, className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
