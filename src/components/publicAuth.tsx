import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { getServices } from "../lib/firebase";

export function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const services = getServices();
    if (!services) return;
    return onAuthStateChanged(services.auth, setUser);
  }, []);
  return user;
}

export function openHq() {
  window.location.hash = "overview";
  window.scrollTo({ top: 0 });
}

/** Signs in with Google, then opens the full HQ, where access follows the user's role. */
export function SignInButton({ user, className = "primary", label }: { user: User | null; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  if (user) {
    const first = (user.displayName ?? "").trim().split(/\s+/)[0];
    return (
      <button type="button" className={className} onClick={openHq}>
        {label ?? (first ? `Open HQ as ${first}` : "Open HQ")}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        const services = getServices();
        if (!services) {
          openHq();
          return;
        }
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        setBusy(true);
        signInWithPopup(services.auth, provider)
          .then(openHq)
          .catch((error: unknown) => {
            const code = (error as { code?: string })?.code ?? "";
            if (!code.includes("popup-closed")) openHq();
          })
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Signing in…" : label ?? "Sign in to HQ"}
    </button>
  );
}
