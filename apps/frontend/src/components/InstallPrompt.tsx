import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * App-install banner. Captures the browser's `beforeinstallprompt` (Chromium) and
 * shows an Install button; on iOS Safari (which doesn't fire that event) it shows
 * the manual "Add to Home Screen" hint instead. Reappears every visit until the
 * app is installed — dismissals are per-session only.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // already installed
    if (sessionStorage.getItem("hideInstall") === "1") return; // dismissed this session

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari: no beforeinstallprompt — guide the user to Add to Home Screen.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    if (isIos && isSafari) { setIos(true); setShow(true); }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => { sessionStorage.setItem("hideInstall", "1"); setShow(false); };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setShow(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
          <BrandLogo className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Install Infinit Email</div>
          {ios ? (
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              Tap <Share className="inline h-3.5 w-3.5" /> then “Add to Home Screen”.
            </div>
          ) : (
            <div className="text-xs text-text-secondary">Add the app to your device for one-tap access.</div>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            <Download className="h-4 w-4" /> Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
