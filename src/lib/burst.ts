const COLORS = ["#c6ff3d", "#ff4fa3", "#3de8ff", "#ffb13b", "#9b7bff"];

/** A short burst at a point. Skipped when the person prefers less motion. */
export function burst(x: number, y: number) {
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const host = document.createElement("div");
  host.className = "burst";
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  for (let i = 0; i < 12; i += 1) {
    const bit = document.createElement("i");
    const angle = (Math.PI * 2 * i) / 12;
    bit.style.background = COLORS[i % COLORS.length];
    bit.style.setProperty("--dx", `${Math.round(Math.cos(angle) * 46)}px`);
    bit.style.setProperty("--dy", `${Math.round(Math.sin(angle) * 32 - 18)}px`);
    host.appendChild(bit);
  }
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 700);
}
