import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useWebmail } from "./store";
import { Button } from "@/components/ui/Button";

/**
 * Nudge users to turn on 2FA. Counts app loads in localStorage; once 2FA is on it
 * never shows. Until then it pops up on every 10th visit.
 */
export function TwoFactorNag() {
  const profile = useWebmail((s) => s.profile);
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile.totpEnabled || profile.emailOtpEnabled) return; // already secured
    if (sessionStorage.getItem("2faNagCounted") === "1") return; // count once per load
    sessionStorage.setItem("2faNagCounted", "1");
    const n = (Number(localStorage.getItem("2faVisits")) || 0) + 1;
    localStorage.setItem("2faVisits", String(n));
    if (n % 10 === 0) setShow(true);
  }, [profile]);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setShow(false)}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-warning" />
        <h2 className="text-lg font-semibold">Secure your mailbox</h2>
        <p className="mt-1 text-sm text-text-secondary">Two-factor authentication isn't on yet. Add an authenticator app or an emailed code to protect your account if your password is ever stolen.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="ghost" onClick={() => setShow(false)}>Remind me later</Button>
          <Button onClick={() => { setShow(false); navigate("/webmail/settings"); }}>Set up 2FA</Button>
        </div>
      </div>
    </div>
  );
}
