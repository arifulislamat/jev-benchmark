export type Verdict = { team: string; urgency: number; refund_requested: boolean; angry: boolean };
export type Label = Verdict;

export type Result = {
  id: number;
  ms: number;
  cost: number;
  in_tokens: number;
  out_tokens: number;
  verdict?: Verdict;
  raw?: {
    team_confidence: number;
    team_probabilities: Record<string, number>;
    urgency_score: number;
    urgency_confidence: number;
    refund_p: number;
    angry_p: number;
  };
  error?: string;
  retries: number;
};

export type FieldStat = { acc: number; n: number };

export type Lane = {
  key: string;
  label: string;
  model: string;
  color: string;
  wall_ms: number;
  answered: number;
  failed: number;
  retries: number;
  vs_spec: Record<string, FieldStat>;
  vs_consensus?: Record<string, FieldStat>;
  cost: number;
  in_tokens: number;
  out_tokens: number;
  latency: { min: number; p10: number; p50: number; p90: number; p95: number; max: number };
  results: Result[];
};

export type Ticket = { id: number; subject: string; body: string; label: Label };

export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } };

export type Run = {
  generated_at: string;
  dataset: { n: number; questions: number };
  questions?: Record<string, Question>;
  requests?: { jev: unknown; llm: unknown };
  concurrency: number;
  consensus_coverage: Record<string, number>;
  agreement: number[][];
  lanes: Lane[];
  judges?: { model: string; wall_ms: number }[];
  tickets: Ticket[];
};

/**
 * Rebuilds when each ticket actually finished. The race ran in slices of
 * `concurrency` awaited one after another, so a slice starts only once the
 * previous slice has fully drained, which is the shape the replay animates.
 */
export function timeline(lane: Lane, concurrency: number) {
  const ends = new Array<number>(lane.results.length);
  let sliceStart = 0;
  for (let i = 0; i < lane.results.length; i += concurrency) {
    let sliceEnd = sliceStart;
    for (let n = i; n < Math.min(i + concurrency, lane.results.length); n++) {
      ends[n] = sliceStart + lane.results[n].ms;
      sliceEnd = Math.max(sliceEnd, ends[n]);
    }
    sliceStart = sliceEnd;
  }
  const order = ends.map((end, i) => ({ i, end })).sort((a, b) => a.end - b.end);
  return { ends, order, total: sliceStart };
}

/** Cumulative answers and cumulative spend, in the order they landed. */
export function cumulative(lane: Lane, concurrency: number) {
  const { order } = timeline(lane, concurrency);
  let cost = 0;
  return order.map(({ i, end }, idx) => {
    cost += lane.results[i].cost;
    return { t: end, n: idx + 1, cost };
  });
}

export const FIELDS = ["team", "urgency", "refund_requested", "angry"] as const;

export const TEAM_COLORS: Record<string, string> = {
  billing: "bg-amber-500",
  technical: "bg-sky-500",
  account: "bg-violet-500",
  sales: "bg-emerald-500",
};

export const quartiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return [s[0], at(0.25), at(0.5), at(0.75), s[s.length - 1]];
};
