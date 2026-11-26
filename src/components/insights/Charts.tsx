import { useState } from "react";
import { diffDays, formatDay } from "../../lib/dates";
import type { Projection, WeekRow } from "../../lib/analytics";
import type { Task } from "../../lib/types";

const short = (iso: string) => formatDay(iso).replace(/ \d{4}$/, "");

/** Weekly created vs closed, two thin bars per week on one axis. */
export function FlowChart({ series }: { series: WeekRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...series.flatMap((row) => [row.created, row.closed]));
  const band = (W - pad.l - pad.r) / series.length;
  const bar = Math.max(4, Math.min(14, band / 3));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  const row = hover == null ? null : series[hover];
  return (
    <figure className="ix-chart">
      <div className="ix-legend" aria-hidden="true">
        <span><i className="sw created" />Created</span>
        <span><i className="sw closed" />Closed</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tasks created and closed each week" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="ix-grid" />
            <text x={pad.l - 6} y={y(tick) + 4} className="ix-axis" textAnchor="end">{tick}</text>
          </g>
        ))}
        {series.map((item, i) => {
          const x = pad.l + i * band + band / 2;
          return (
            <g key={item.end} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * band} y={pad.t} width={band} height={H - pad.t - pad.b} className="ix-hit" />
              <rect x={x - bar - 1} y={y(item.created)} width={bar} height={Math.max(0, y(0) - y(item.created))} rx={3} className="ix-created" />
              <rect x={x + 1} y={y(item.closed)} width={bar} height={Math.max(0, y(0) - y(item.closed))} rx={3} className="ix-closed" />
              {i % 2 === series.length % 2 ? <text x={x} y={H - 8} className="ix-axis" textAnchor="middle">{short(item.end)}</text> : null}
            </g>
          );
        })}
      </svg>
      {row ? (
        <div className="ix-tip" role="status">
          <b>Week to {short(row.end)}</b>
          <span><i className="sw created" />Created {row.created}</span>
          <span><i className="sw closed" />Closed {row.closed}</span>
          <span>Open at week end {row.backlog}</span>
        </div>
      ) : <p className="ix-hint">Hover a week for its numbers.</p>}
    </figure>
  );
}

/** Open tasks at each week end, with the fitted 4-week projection dashed. */
export function BacklogChart({ series, projection }: { series: WeekRow[]; projection: Projection }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = [...series.map((row) => ({ end: row.end, v: row.backlog, proj: false })), ...projection.weeks.map((row) => ({ end: row.end, v: row.backlog, proj: true }))];
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...points.map((p) => p.v));
  const step = (W - pad.l - pad.r) / Math.max(1, points.length - 1);
  const x = (i: number) => pad.l + i * step;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const actual = points.filter((p) => !p.proj);
  const lastActual = actual.length - 1;
  const path = (list: { v: number }[], from: number) => list.map((p, i) => `${i ? "L" : "M"}${x(from + i)},${y(p.v)}`).join(" ");
  const hovered = hover == null ? null : points[hover];
  return (
    <figure className="ix-chart">
      <div className="ix-legend" aria-hidden="true">
        <span><i className="sw line" />Open at week end</span>
        <span><i className="sw dash" />Projection</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Open tasks over time with a four week projection" onMouseLeave={() => setHover(null)}>
        {[0, Math.round(max / 2), max].map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="ix-grid" />
            <text x={pad.l - 6} y={y(tick) + 4} className="ix-axis" textAnchor="end">{tick}</text>
          </g>
        ))}
        <path d={path(actual, 0)} className="ix-line" />
        <path d={path([actual[lastActual], ...points.slice(lastActual + 1)], lastActual)} className="ix-line dash" />
        {hovered ? <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={H - pad.b} className="ix-cross" /> : null}
        {points.map((p, i) => (
          <g key={p.end} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - step / 2} y={pad.t} width={step} height={H - pad.t - pad.b} className="ix-hit" />
            <circle cx={x(i)} cy={y(p.v)} r={hover === i ? 5 : 3} className={p.proj ? "ix-dot proj" : "ix-dot"} />
            {i % 2 === 0 ? <text x={x(i)} y={H - 8} className="ix-axis" textAnchor="middle">{short(p.end)}</text> : null}
          </g>
        ))}
      </svg>
      {hovered ? (
        <div className="ix-tip" role="status"><b>{hovered.proj ? "Projected" : "Week to"} {short(hovered.end)}</b><span>{hovered.v} open</span></div>
      ) : <p className="ix-hint">Hover a point for its number.</p>}
    </figure>
  );
}

/** One horizontal bar per brand: share of work closed in the period. */
export function BrandBars({ rows }: { rows: { label: string; closed: number; share: number; open: number; overdue: number; momentum: number | null }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.closed));
  return (
    <ul className="ix-brands">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="ix-bname">{row.label}</span>
          <span className="ix-btrack"><span style={{ width: `${(row.closed / max) * 100}%` }} /></span>
          <b>{row.closed}</b>
          <span className="ix-bmeta">
            {Math.round(row.share * 100)}% of closed · {row.open} open{row.overdue ? ` · ${row.overdue} late` : ""}
            {row.momentum == null ? "" : row.momentum > 0 ? ` · ▲ ${Math.round(row.momentum * 100)}%` : row.momentum < 0 ? ` · ▼ ${Math.round(-row.momentum * 100)}%` : " · steady"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Open work per person as bars from the day given to the due day (or today). */
export function Timeline({ groups, today }: { groups: { id: string; name: string; tasks: Task[] }[]; today: string }) {
  const [hover, setHover] = useState<Task | null>(null);
  const back = 30;
  const ahead = 14;
  const span = back + ahead;
  const pos = (iso: string) => Math.min(100, Math.max(0, ((diffDays(today, iso) + back) / span) * 100));
  return (
    <div className="ix-tl">
      <div className="ix-tl-axis" aria-hidden="true">
        <span style={{ left: "0%" }}>{short(new Date(Date.parse(`${today}T00:00:00Z`) - back * 864e5).toISOString().slice(0, 10))}</span>
        <span style={{ left: `${(back / span) * 100}%` }} className="today">Today</span>
        <span style={{ left: "100%" }}>+{ahead}d</span>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="ix-tl-group">
          <p className="ix-tl-name">{group.name} <span className="meta">{group.tasks.length} open</span></p>
          {group.tasks.map((task) => {
            const end = task.dueDate ?? today;
            const left = pos(task.givenDate);
            const right = pos(end < task.givenDate ? task.givenDate : end);
            const late = Boolean(task.dueDate && task.dueDate < today);
            return (
              <div key={task.id} className="ix-tl-row" onMouseEnter={() => setHover(task)} onMouseLeave={() => setHover(null)}>
                <span className="ix-tl-today" style={{ left: `${(back / span) * 100}%` }} />
                <span
                  className={`ix-tl-bar${late ? " late" : ""}${task.dueDate ? "" : " nodue"}${task.lane === "waiting" ? " waiting" : ""}`}
                  style={{ left: `${left}%`, width: `${Math.max(1.2, right - left)}%` }}
                  title={`${task.title} · given ${formatDay(task.givenDate)} · ${task.dueDate ? `due ${formatDay(task.dueDate)}` : "no due date"}`}
                >
                  {late ? <em>late</em> : null}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      {hover ? (
        <div className="ix-tip" role="status">
          <b>{hover.title}</b>
          <span>Given {formatDay(hover.givenDate)} · {hover.dueDate ? `due ${formatDay(hover.dueDate)}` : "no due date"} · {hover.lane ?? "todo"}</span>
        </div>
      ) : <p className="ix-hint">Bars run from the day a task was given to its due date. Pink = past due, outline = no due date, orange = waiting.</p>}
    </div>
  );
}
