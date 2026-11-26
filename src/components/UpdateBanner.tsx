import { useEffect, useState } from "react";

const CHECK_MS = 2 * 60 * 1000;

function currentBundle(): string | null {
  const script = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].find((item) => /\/assets\/index-[^/]+\.js$/.test(item.src));
  return script ? (new URL(script.src).pathname.split("/").pop() ?? null) : null;
}

/**
 * HQ is a single page, so a tab left open keeps running the old code after a
 * deploy. Every couple of minutes (and when the tab comes back into view) this
 * checks the live index.html and offers a reload when the code has changed.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const mine = currentBundle();
    if (!mine) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const html = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: "no-store" }).then((res) => res.text());
        const live = /assets\/(index-[^"'/]+\.js)/.exec(html)?.[1];
        if (live && live !== mine) setStale(true);
      } catch {
        /* offline: try again later */
      }
    };
    const timer = window.setInterval(() => void check(), CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      <span>HQ was updated. Reload to get the latest version.</span>
      <button type="button" className="primary" onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}
