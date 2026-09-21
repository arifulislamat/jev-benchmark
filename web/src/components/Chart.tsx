import { useState } from "react";

export type Series = {
  key: string;
  label: string;
  color: string;
  points: { t: number; n: number; cost: number }[]; // t in ms, n cumulative answered
};

const W = 860;
const H = 320;
const PAD = { top: 16, right: 92, bottom: 34, left: 44 };

const money = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** Cumulative answers over elapsed time. One axis, one measure, two series. */
export function Chart({ series, elapsed, duration }: { series: Series[]; elapsed: number; duration: number }) {
  const [hoverT, setHoverT] = useState<number | null>(null);

  const maxN = Math.max(...series.map((s) => s.points.length));
  const x = (t: number) => PAD.left + (t / duration) * (W - PAD.left - PAD.right);
  const y = (n: number) => H - PAD.bottom - (n / maxN) * (H - PAD.top - PAD.bottom);

  // A completion is a step, not a slope: the count holds until the next answer lands.
  const path = (pts: Series["points"], until: number) => {
    const visible = pts.filter((p) => p.t <= until);
    if (!visible.length) return "";
    let d = `M ${x(0)} ${y(0)}`;
    for (const p of visible) d += ` L ${x(p.t)} ${y(p.n - 1)} L ${x(p.t)} ${y(p.n)}`;
    d += ` L ${x(Math.min(until, pts[pts.length - 1].t))} ${y(visible.length)}`;
    return d;
  };

  const at = (s: Series, t: number) => {
    const done = s.points.filter((p) => p.t <= t);
    const last = done[done.length - 1];
    return { n: done.length, cost: last?.cost ?? 0, finished: done.length === s.points.length };
  };

  const ticks = { x: [0, 5, 10, 15, 20, 25].filter((s) => s * 1000 <= duration * 1.02), y: [0, 50, 100, 150, 200] };
  const readT = hoverT ?? Math.min(elapsed, duration);

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {series.map((s) => {
          const v = at(s, readT);
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-sm font-medium">{s.label}</span>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {v.n} answered, {money(v.cost)}
              </span>
            </div>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        role="img"
        aria-label="Tickets answered over elapsed time, Jev against Claude Haiku 4.5"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const t = ((px - PAD.left) / (W - PAD.left - PAD.right)) * duration;
          setHoverT(Math.max(0, Math.min(duration, t)));
        }}
        onPointerLeave={() => setHoverT(null)}
      >
        <title>Tickets answered over elapsed time</title>

        {ticks.y.map((n) => (
          <g key={n}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(n)} y2={y(n)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(n) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {n}
            </text>
          </g>
        ))}
        {ticks.x.map((s) => (
          <text key={s} x={x(s * 1000)} y={H - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {s}s
          </text>
        ))}

        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.points, Math.min(elapsed, duration))}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {/* Direct labels so identity never rests on colour alone. */}
        {series.map((s) => {
          const v = at(s, Math.min(elapsed, duration));
          if (!v.n) return null;
          const lastT = Math.min(elapsed, s.points[v.n - 1].t);
          return (
            <text key={s.key} x={x(lastT) + 8} y={y(v.n) + 4} className="text-[12px] font-medium" fill={s.color}>
              {s.label.split(" ")[0]}
            </text>
          );
        })}

        {hoverT !== null && (
          <>
            <line
              x1={x(hoverT)}
              x2={x(hoverT)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-foreground/30"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const v = at(s, hoverT);
              return v.n ? (
                <circle key={s.key} cx={x(hoverT)} cy={y(v.n)} r={4} fill={s.color} className="stroke-background" strokeWidth={2} />
              ) : null;
            })}
            <text x={x(hoverT)} y={PAD.top - 2} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {(hoverT / 1000).toFixed(1)}s
            </text>
          </>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-muted-foreground">
        Tickets answered against elapsed time. Hover to read either line at a moment. The gap between the two lines is
        the whole result: same work, same order, one finishes while the other is still going.
      </figcaption>
    </figure>
  );
}
