import type { PipelineBoard, PipelineStage } from "./types.ts";

export const KRAYA_BRANDS = ["skybox", "fnh"] as const;
export type KrayaBrand = (typeof KRAYA_BRANDS)[number];

export const KRAYA_LABEL: Record<KrayaBrand, string> = {
  skybox: "Skybox",
  fnh: "F&H",
};

const EMAIL = /@/;
const MONEY = /[₹$€£]/;

function stamp(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    const seconds = record.seconds ?? record._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return "";
}

function stage(value: unknown): PipelineStage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { name?: unknown; count?: unknown };
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const count = typeof record.count === "number" ? record.count : Number.NaN;
  if (!name || name.length > 80 || EMAIL.test(name) || MONEY.test(name)) return null;
  if (!Number.isInteger(count) || count < 0) return null;
  return { name, count };
}

/** Read one pipeline/{brand} document. Order of stages is kept as Kraya sent it. */
export function mapPipeline(id: string, raw: unknown): PipelineBoard | null {
  if (id !== "skybox" && id !== "fnh") return null;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.source !== "kraya") return null;
  const stages = Array.isArray(record.stages) ? record.stages.flatMap((item) => {
    const row = stage(item);
    return row ? [row] : [];
  }) : [];
  const account = typeof record.account === "string" && !EMAIL.test(record.account) ? record.account.trim().slice(0, 80) : "";
  const total = typeof record.total === "number" && Number.isInteger(record.total) && record.total >= 0
    ? record.total
    : stages.reduce((sum, row) => sum + row.count, 0);
  return {
    id,
    brand: id,
    source: "kraya",
    account,
    stages,
    total,
    syncedAt: stamp(record.syncedAt),
  };
}
