/** Turn pasted text into a safe https link, or null when it is not a real web address. */
export function cleanUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:") return null;
    const host = url.hostname;
    if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** A readable default name for a link. */
export function guessName(url: string): string {
  try {
    const u = new URL(url);
    if (/docs\.google\.com/.test(u.host)) {
      const kind = u.pathname.split("/")[1];
      return kind === "spreadsheets" ? "Google Sheet" : kind === "presentation" ? "Google Slides" : kind === "forms" ? "Google Form" : "Google Doc";
    }
    if (/drive\.google\.com/.test(u.host)) return "Drive file";
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return last || u.host;
  } catch {
    return "Link";
  }
}
