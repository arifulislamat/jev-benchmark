// Generates the benchmark dataset: support tickets written FROM a known label,
// so ground truth is free. Run once, commit the output.
// Run: node --env-file=.env scripts/gen-tickets.ts
import { writeFileSync } from "node:fs";
import { type Label, TEAMS, URGENCY } from "./taxonomy.ts";

const N = 200;
const CONCURRENCY = 20;

// Deterministic PRNG so the dataset is reproducible from the seed alone.
let seed = 20260921;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const SURFACES = [
  "the Jira sync", "SSO / SAML login", "the mobile app", "CSV export", "the Gantt view",
  "the public API", "an invoice PDF", "webhooks", "time tracking", "email notifications",
  "the annual plan renewal", "VAT on the invoice", "seat management", "two-factor auth",
  "the kanban board", "file attachments", "search", "guest access", "sprint reports",
  "the Slack integration", "calendar sync", "the audit log", "recurring billing", "custom fields",
] as const;

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const TEAM_KEYS = Object.keys(TEAMS) as (keyof typeof TEAMS)[];

const labels: (Label & { surface: string })[] = Array.from({ length: N }, () => ({
  team: pick(TEAM_KEYS),
  urgency: Math.floor(rnd() * 4),
  // A refund only makes sense for billing-ish tickets; keep the data honest.
  refund_requested: rnd() < 0.35,
  angry: rnd() < 0.3,
  surface: pick(SURFACES),
})).map((l) => ({ ...l, refund_requested: l.refund_requested && l.team !== "sales" }));

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: { subject: { type: "string" }, body: { type: "string" } },
} as const;

// One ticket per call. Asking for N-in-one was schema-valid but miscounted on 11 of 20
// batches (12 tickets for 10 specs), and no minItems/maxItems stopped it.
async function genOne(l: Label & { surface: string }, i: number) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 600,
      temperature: 1,
      messages: [
        {
          role: "user",
          content: `Write ONE realistic customer support ticket for a B2B SaaS project management tool (~$49/seat/month).

It must genuinely match this hidden spec, without ever stating the labels:
- it must unambiguously belong to the "${l.team}" team, whose scope is exactly: ${TEAMS[l.team]}
- it must NOT plausibly belong to any other team
- how urgent it is: ${URGENCY[l.urgency]}
- the customer is${l.refund_requested ? "" : " NOT"} explicitly asking for money back
- the customer sounds ${l.angry ? "angry and frustrated" : "calm and matter-of-fact"}
- the ticket is about ${l.surface}

Write like a real customer, not a support agent: typos, run-on sentences, missing context. Vary the length between 1 and 6 sentences. Sometimes mention an order, invoice or seat count. Never use the words "urgency", "team", or "refund_requested".`,
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "ticket", strict: true, schema } },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`ticket ${i}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  const { subject, body } = JSON.parse(json.choices[0].message.content);
  const { surface, ...label } = l;
  return { id: i, subject, body, label };
}

const out: unknown[] = [];
for (let i = 0; i < labels.length; i += CONCURRENCY) {
  const slice = labels.slice(i, i + CONCURRENCY);
  out.push(...(await Promise.all(slice.map((l, n) => genOne(l, i + n)))));
  process.stdout.write(`${out.length}/${N}\r`);
}

writeFileSync("data/tickets.json", JSON.stringify(out, null, 2));
console.log(`\nwrote data/tickets.json: ${out.length} tickets`);
