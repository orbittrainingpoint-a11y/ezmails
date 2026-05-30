import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">ezmails</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
          </div>
          <div className="rounded-lg border border-border bg-surface p-6 shadow-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
