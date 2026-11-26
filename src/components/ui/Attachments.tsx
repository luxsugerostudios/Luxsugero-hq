import { useState } from "react";
import { useHqContext } from "../../lib/hq";
import type { Attachment } from "../../lib/types";

export type LinkDraft = { name: string; url: string };

const DRIVE = "https://drive.google.com/drive/my-drive";

export function cleanUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

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

function icon(url: string): string {
  if (/spreadsheets/.test(url)) return "▦";
  if (/presentation/.test(url)) return "▭";
  if (/drive\.google|docs\.google/.test(url)) return "◆";
  return "↗";
}

/** Inline "add a link" row with a shortcut to Google Drive for uploading. */
export function LinkAdder({ onAdd, busy = false }: { onAdd: (link: LinkDraft) => void; busy?: boolean }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const clean = cleanUrl(url);
    if (!clean) {
      setError("Paste a full https link, e.g. a Google Drive share link.");
      return;
    }
    onAdd({ url: clean, name: name.trim() || guessName(clean) });
    setUrl("");
    setName("");
    setError("");
  };
  return (
    <div className="att-add">
      <div className="att-row">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Paste a Drive or file link"
          aria-label="Attachment link"
        />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" aria-label="Attachment name" maxLength={120} />
        <button type="button" className="ghost" disabled={busy || !url.trim()} onClick={submit}>Attach</button>
        <a className="att-drive" href={DRIVE} target="_blank" rel="noreferrer">Open Drive</a>
      </div>
      {error ? <p className="att-error" role="alert">{error}</p> : <p className="meta">Upload in Drive, choose Share › Copy link, then paste it here.</p>}
    </div>
  );
}

export function LinkList({ items, onRemove }: { items: { key: string; name: string; url: string }[]; onRemove?: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="att-list">
      {items.map((item) => (
        <li key={item.key}>
          <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>
            <i aria-hidden="true">{icon(item.url)}</i>
            <span>{item.name}</span>
          </a>
          {onRemove ? <button type="button" className="att-x" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.key)}>✕</button> : null}
        </li>
      ))}
    </ul>
  );
}

/** Saved attachments for a task or standup, with an add row for the team. */
export function Attachments({ parentType, parentId, canAdd = true }: { parentType: Attachment["parentType"]; parentId: string; canAdd?: boolean }) {
  const hq = useHqContext();
  const [busy, setBusy] = useState(false);
  const items = hq.data.attachments.filter((item) => item.parentType === parentType && item.parentId === parentId);
  const team = hq.isAdmin || hq.isMember;
  return (
    <div className="att">
      <LinkList
        items={items.map((item) => ({ key: item.id, name: item.name, url: item.url }))}
        onRemove={hq.isAdmin ? (id) => void hq.deleteAttachment(id).catch(() => undefined) : undefined}
      />
      {team && canAdd ? (
        <LinkAdder
          busy={busy}
          onAdd={(link) => {
            setBusy(true);
            void hq
              .addAttachment({ id: crypto.randomUUID(), parentType, parentId, name: link.name, url: link.url, addedBy: hq.personId ?? "admin", addedAt: new Date().toISOString() })
              .catch(() => undefined)
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      {!items.length && !(team && canAdd) ? <p className="meta">No attachments.</p> : null}
    </div>
  );
}
