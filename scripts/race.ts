// The race: the same tickets, the same four questions, the same criteria strings,
// the same concurrency, the same machine. Jev's decisions endpoint against three
// mid-tier text models in strict JSON mode. Writes web/public/run.json.
// Run: node --env-file=.env scripts/race.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { llmPrompt, LLM_SCHEMA, QUESTIONS, TEAMS, type Ticket } from "./taxonomy.ts";

const N = Number(process.env.N ?? 100);
const CONCURRENCY = 20;
const KEY = process.env.OPENROUTER_API_KEY;

// One workhorse model per lab. Not the flagship, not the nano tier: the model you
// would actually put on a job like this if you were paying the bill yourself.
const CONTESTANTS = [
  { key: "jev", label: "Jev", model: "typesafe/jev-1.13", color: "#1baf7a" },
  { key: "sonnet", label: "Claude Sonnet 5", model: "anthropic/claude-sonnet-5", color: "#2a78d6" },
  { key: "gpt", label: "GPT-5.6 Sol", model: "openai/gpt-5.6-sol", color: "#eb6834" },
  { key: "gemini", label: "Gemini 3.8 Flash", model: "google/gemini-3.8-flash", color: "#4a3aa7" },
] as const;

// Accuracy needs a reference, and the cheapest honest one is already paid for: grade
// each contestant against the majority answer of the OTHER three. No model votes on
// its own answer. Frontier judges cost more than the race itself, so they are opt-in:
//   JUDGES=openai/gpt-6-astra,anthropic/claude-opus-5 node --env-file=.env scripts/race.ts
const JUDGES = (process.env.JUDGES ?? "").split(",").filter(Boolean);

const allTickets: Ticket[] = JSON.parse(readFileSync("data/tickets.json", "utf8"));
const tickets = allTickets.slice(0, N);

type Verdict = { team: string; urgency: number; refund_requested: boolean; angry: boolean };
type Result = {
  id: number;
  ms: number;
  cost: number;
  in_tokens: number;
  out_tokens: number;
  verdict?: Verdict;
  raw?: unknown;
  error?: string;
  retries: number;
};

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------- Jev
async function runJev(t: Ticket): Promise<Result> {
  const started = performance.now();
  const res = await post("https://openrouter.ai/api/alpha/decisions", {
    model: CONTESTANTS[0].model,
    state: { subject: t.subject, body: t.body },
    questions: QUESTIONS,
  });
  const json = await res.json();
  const ms = performance.now() - started;
  if (res.status === 402 || res.status === 403) throw new Error(`jev: ${json?.error?.message ?? res.statusText}`);
  if (!res.ok)
    return { id: t.id, ms, cost: 0, in_tokens: 0, out_tokens: 0, retries: 0, error: JSON.stringify(json).slice(0, 200) };

  const a = json.answers;
  return {
    id: t.id,
    ms,
    cost: json.usage.cost,
    in_tokens: json.usage.input_tokens,
    out_tokens: json.usage.output_tokens,
    retries: 0,
    verdict: {
      team: a.team.choice,
      urgency: Math.round(a.urgency.score),
      refund_requested: a.refund_requested.noul >= 0.5,
      angry: a.angry.noul >= 0.5,
    },
    // Jev hands back its own uncertainty. The text models do not.
    raw: {
      team_confidence: a.team.confidence,
      team_probabilities: a.team.probabilities,
      urgency_score: a.urgency.score,
      urgency_confidence: a.urgency.confidence,
      refund_p: a.refund_requested.noul,
      angry_p: a.angry.noul,
    },
  };
}

// ---------------------------------------------------------------- text models
async function runLlm(t: Ticket, model: string, attempt = 0): Promise<Result> {
  const started = performance.now();
  const res = await post("https://openrouter.ai/api/v1/chat/completions", {
    model,
    // 200 was too tight: a reasoning model spent its whole budget thinking and
    // returned a truncated sentence, which then failed to parse. That was my cap,
    // not the model. Low effort is uniform across every lane and judge, because
    // triage does not need deep reasoning and the token bill should stay honest.
    max_tokens: 1500,
    reasoning: { effort: "low" },
    messages: [{ role: "user", content: llmPrompt(t) }],
    response_format: { type: "json_schema", json_schema: { name: "triage", strict: true, schema: LLM_SCHEMA } },
    usage: { include: true },
  });
  const json = await res.json();
  const ms = performance.now() - started;

  // 402 and 403 are billing, not bad luck. Retrying them just wastes wall clock.
  if (res.status === 402 || res.status === 403) throw new Error(`${model}: ${json?.error?.message ?? res.statusText}`);

  const fail = (error: string): Promise<Result> | Result =>
    attempt < 2
      ? runLlm(t, model, attempt + 1).then((r) => ({ ...r, retries: r.retries + 1, ms: r.ms + ms }))
      : { id: t.id, ms, cost: json?.usage?.cost ?? 0, in_tokens: 0, out_tokens: 0, retries: attempt, error };

  if (!res.ok) return fail(JSON.stringify(json).slice(0, 200));

  // The tax Jev does not charge: the answer arrives as a string that has to be
  // parsed and checked before any of it can be trusted.
  let verdict: Verdict;
  try {
    verdict = JSON.parse(json.choices[0].message.content);
  } catch {
    return fail(`unparseable JSON (finish_reason ${json.choices?.[0]?.finish_reason})`);
  }
  // A model returned the literal document `null`, which parses cleanly and then
  // throws on the first property read. Parsing is not validating.
  if (typeof verdict !== "object" || verdict === null || Array.isArray(verdict))
    return fail(`parsed to ${JSON.stringify(verdict)}, not an object`);
  if (
    !Object.keys(TEAMS).includes(verdict.team) ||
    !Number.isInteger(verdict.urgency) ||
    verdict.urgency < 0 ||
    verdict.urgency > 3 ||
    typeof verdict.refund_requested !== "boolean" ||
    typeof verdict.angry !== "boolean"
  )
    return fail(`schema-valid but out of range: ${JSON.stringify(verdict)}`);

  return {
    id: t.id,
    ms,
    cost: json.usage.cost,
    in_tokens: json.usage.prompt_tokens,
    out_tokens: json.usage.completion_tokens,
    retries: attempt,
    verdict,
  };
}

// ---------------------------------------------------------------- runner
async function phase(name: string, fn: (t: Ticket) => Promise<Result>) {
  const cache = `data/phase-${name.replace(/\W+/g, "-")}-${N}.json`;
  if (existsSync(cache) && !process.env.FORCE) {
    const hit = JSON.parse(readFileSync(cache, "utf8"));
    console.log(`${name.padEnd(36)} ${hit.results.length}/${tickets.length} from cache (FORCE=1 to re-run)`);
    return hit as { results: Result[]; wall_ms: number };
  }
  const results: Result[] = [];
  const started = performance.now();
  for (let i = 0; i < tickets.length; i += CONCURRENCY) {
    const slice = tickets.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(slice.map((t) => fn(t)))));
    process.stdout.write(`${name}: ${results.length}/${tickets.length}\r`);
  }
  const wall_ms = performance.now() - started;
  console.log(`${name.padEnd(36)} ${results.length}/${tickets.length} in ${(wall_ms / 1000).toFixed(1)}s`);
  writeFileSync(cache, JSON.stringify({ results, wall_ms }));
  return { results, wall_ms };
}

const FIELDS = ["team", "urgency", "refund_requested", "angry"] as const;
type Field = (typeof FIELDS)[number];
const rate = (n: number, d: number) => (d === 0 ? 0 : n / d);

const score = (results: Result[], truth?: Map<number, Partial<Verdict>>) => {
  const answered = results.filter((r) => r.verdict).length;
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
  const vs = (get: (id: number) => Partial<Verdict> | undefined) =>
    Object.fromEntries(
      FIELDS.map((f) => {
        const judged = results.filter((r) => r.verdict && get(r.id)?.[f] !== undefined);
        return [
          f,
          { acc: rate(judged.filter((r) => r.verdict![f] === get(r.id)![f]).length, judged.length), n: judged.length },
        ];
      }),
    ) as Record<Field, { acc: number; n: number }>;

  return {
    answered,
    failed: results.length - answered,
    retries: results.reduce((s, r) => s + r.retries, 0),
    vs_spec: vs((id) => tickets.find((t) => t.id === id)?.label),
    vs_consensus: truth ? vs((id) => truth.get(id)) : undefined,
    cost: results.reduce((s, r) => s + r.cost, 0),
    in_tokens: results.reduce((s, r) => s + r.in_tokens, 0),
    out_tokens: results.reduce((s, r) => s + r.out_tokens, 0),
    latency: { min: lat[0], p10: q(0.1), p50: q(0.5), p90: q(0.9), p95: q(0.95), max: lat[lat.length - 1] },
  };
};

// Contestants first, one after another. Running two at once would have them fighting
// for the same sockets, and wall clock is one of the numbers being claimed.
const lanes = [];
for (const c of CONTESTANTS) {
  const run = await phase(c.label, c.key === "jev" ? runJev : (t) => runLlm(t, c.model));
  lanes.push({ ...c, ...run });
}

const judgeRuns = [];
for (const model of JUDGES) judgeRuns.push({ model, ...(await phase(`judge ${model}`, (t) => runLlm(t, model))) });

const laneMaps = lanes.map((l) => new Map(l.results.map((r) => [r.id, r.verdict])));
const judgeMaps = judgeRuns.map((j) => new Map(j.results.map((r) => [r.id, r.verdict])));

/**
 * Leave-one-out majority. For contestant `skip`, the reference is what the other
 * contestants agreed on (plus any opt-in judges), and a field only counts when at
 * least two of them said the same thing. A model never grades itself.
 */
const consensusFor = (skip: number) => {
  const voters = [...laneMaps.filter((_, i) => i !== skip), ...judgeMaps];
  const out = new Map<number, Partial<Verdict>>();
  for (const t of tickets) {
    const agreed: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const tally = new Map<unknown, number>();
      for (const m of voters) {
        const v = m.get(t.id)?.[f];
        if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      const [best, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
      if (count >= 2) agreed[f] = best;
    }
    out.set(t.id, agreed as Partial<Verdict>);
  }
  return out;
};

const consensuses = lanes.map((_, i) => consensusFor(i));
const consensus_coverage = Object.fromEntries(
  FIELDS.map((f) => [
    f,
    rate(tickets.filter((t) => consensuses[0].get(t.id)?.[f] !== undefined).length, tickets.length),
  ]),
) as Record<Field, number>;

// How often does each pair of contestants say exactly the same thing?
const verdictMaps = lanes.map((l) => new Map(l.results.map((r) => [r.id, r.verdict])));
const agreement = lanes.map((_, a) =>
  lanes.map((_, b) =>
    rate(
      tickets.filter((t) => {
        const x = verdictMaps[a].get(t.id);
        const y = verdictMaps[b].get(t.id);
        return x && y && FIELDS.every((f) => x[f] === y[f]);
      }).length,
      tickets.length,
    ),
  ),
);

const sample = tickets[0];
const run = {
  generated_at: new Date().toISOString(),
  dataset: { n: tickets.length, questions: Object.keys(QUESTIONS).length },
  questions: QUESTIONS,
  requests: {
    jev: { model: CONTESTANTS[0].model, state: { subject: sample.subject, body: sample.body }, questions: QUESTIONS },
    llm: {
      model: CONTESTANTS[1].model,
      max_tokens: 200,
      messages: [{ role: "user", content: llmPrompt(sample) }],
      response_format: { type: "json_schema", json_schema: { name: "triage", strict: true, schema: LLM_SCHEMA } },
    },
  },
  concurrency: CONCURRENCY,
  consensus_coverage,
  agreement,
  lanes: lanes.map((l, i) => ({
    key: l.key,
    label: l.label,
    model: l.model,
    color: l.color,
    wall_ms: l.wall_ms,
    ...score(l.results, consensuses[i]),
    results: l.results,
  })),
  judges: judgeRuns.map((j) => ({ model: j.model, wall_ms: j.wall_ms, ...score(j.results) })),
  tickets,
};

writeFileSync("web/public/run.json", JSON.stringify(run));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log("");
for (const l of run.lanes)
  console.log(
    `${l.label.padEnd(18)} ${(l.wall_ms / 1000).toFixed(1).padStart(5)}s  $${l.cost.toFixed(4)}  p50 ${l.latency.p50.toFixed(0).padStart(5)}ms  fails ${l.failed}  retries ${l.retries}`,
  );
console.log(`\nconsensus coverage: ${FIELDS.map((f) => `${f} ${pct(consensus_coverage[f])}`).join("  ")}`);
console.log("accuracy vs consensus:");
for (const l of run.lanes)
  console.log(`  ${l.label.padEnd(18)} ${FIELDS.map((f) => `${f} ${pct(l.vs_consensus![f].acc)}`).join("  ")}`);
const cheapest = run.lanes.slice(1).reduce((a, b) => (a.cost < b.cost ? a : b));
console.log(`\ncheapest text model costs ${(cheapest.cost / run.lanes[0].cost).toFixed(1)}x what Jev costs`);
