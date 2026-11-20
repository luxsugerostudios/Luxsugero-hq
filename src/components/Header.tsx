import { useState } from "react";
import { useHqContext } from "../lib/hq";

export function Header({
  theme,
  onToggleTheme,
  showAssign = false,
  onAssign,
  onSearch,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  showAssign?: boolean;
  onAssign?: () => void;
  onSearch?: () => void;
}) {
  const { configured, user, access, signIn, signOutUser } = useHqContext();
  const [copied, setCopied] = useState(false);
  const [density, setDensity] = useState(() => document.documentElement.dataset.density ?? "comfortable");
  const role =
    access === "admin" ? "Admin" : access === "member" ? "Member" : access === "guest" ? "Not on the roster" : "Public";

  return (
    <div className="toolbar">
      <span className="role">{role}</span>
      {onSearch ? <button type="button" className="ghost" onClick={onSearch}>Search</button> : null}
      <button
        type="button"
        className="ghost"
        onClick={() => {
          const next = density === "compact" ? "comfortable" : "compact";
          document.documentElement.dataset.density = next;
          setDensity(next);
          try { localStorage.setItem("hq-density", next); } catch { /* ignore */ }
        }}
      >
        {density === "compact" ? "Comfortable" : "Compact"}
      </button>
      {showAssign && onAssign ? (
        <button type="button" className="primary assign-top" onClick={onAssign}>
          + Assign task
        </button>
      ) : null}
      {user?.email ? <span className="who">{user.email}</span> : null}
      <button
        type="button"
        className="ghost"
        onClick={() => {
          const url = new URL(window.location.href);
          url.hash = "#/public";
          void navigator.clipboard.writeText(url.toString()).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            },
            () => undefined,
          );
        }}
      >
        {copied ? "Copied" : "Public view"}
      </button>
      <button type="button" className="ghost" onClick={onToggleTheme}>
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      {user ? (
        <button type="button" className="ghost" onClick={() => void signOutUser()}>
          Sign out
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={() => void signIn()}
          disabled={!configured}
          title={configured ? "Sign in with Google" : "Add the Firebase web config first"}
        >
          Sign in with Google
        </button>
      )}
    </div>
  );
}

export function bannerCopy(
  phase: "unconfigured" | "connecting" | "live" | "denied" | "unreachable",
): string | null {
  switch (phase) {
    case "unconfigured":
      return "Firebase is not configured. Showing the bundled sample, read only.";
    case "connecting":
      return null;
    case "denied":
      return "Firestore refused the read. Showing the bundled sample until the rules are published.";
    case "unreachable":
      return "Firestore did not respond. Showing the bundled sample.";
    case "live":
      return null;
  }
}
