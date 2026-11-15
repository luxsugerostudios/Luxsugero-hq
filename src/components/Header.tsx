import { useHqContext } from "../lib/hq";

export function Header({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const { configured, user, canEdit, viewOnly, founderAccount, signIn, signOutUser } =
    useHqContext();

  return (
    <header className="top">
      <div>
        <p className="brand">
          <span>Luxsugero</span> HQ
        </p>
        <p className="where">New Delhi</p>
      </div>
      <div className="toolbar">
        <button type="button" className="ghost" onClick={onToggleTheme}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        {user ? (
          <>
            {viewOnly ? <span className="badge view">View only</span> : null}
            {canEdit ? <span className="badge edit">Editing</span> : null}
            {founderAccount && !canEdit ? (
              <span className="badge view">Signed in</span>
            ) : null}
            <span className="who">{user.email}</span>
            <button type="button" className="ghost" onClick={() => void signOutUser()}>
              Sign out
            </button>
          </>
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
    </header>
  );
}

export function bannerCopy(
  phase: "unconfigured" | "connecting" | "live" | "denied" | "unreachable",
): string | null {
  switch (phase) {
    case "unconfigured":
      return "Backend not configured. Showing seed data, read only. Paste the Firebase web config into src/firebaseConfig.ts.";
    case "connecting":
      return "Checking Firestore… Showing seed data until the live read succeeds.";
    case "denied":
      return "Firestore is still locked. Showing seed data, read only, until firestore.rules is published.";
    case "unreachable":
      return "Couldn't reach Firestore. Showing seed data, read only.";
    case "live":
      return null;
  }
}
