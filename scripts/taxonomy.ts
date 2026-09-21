// One definition of the label space, imported by the generator AND both graders.
// If the two sides of a benchmark are given different words for the same category,
// the benchmark measures the wording, not the models.

export const TEAMS = {
  billing: "Invoices, charges, refunds, payment methods, or subscription cost.",
  technical: "Bugs, outages, errors, broken integrations, or the product not working as documented.",
  account: "Login, passwords, permissions, roles, seats, or profile and workspace settings.",
  sales: "Pricing questions, plan upgrades, trials, quotes, or buying more seats.",
} as const;

export const URGENCY = [
  "Can wait until next week. Nothing is blocked.",
  "Should be handled today, but the customer can still work.",
  "The customer is blocked right now and cannot do their job.",
  "Money is actively being lost or data is at risk. Minutes matter.",
] as const;

export const QUESTIONS = {
  team: {
    type: "choice",
    instructions: "Which team should own this ticket?",
    criteria: TEAMS,
  },
  urgency: {
    type: "score",
    instructions: "How urgent is this ticket?",
    criteria: URGENCY,
  },
  refund_requested: {
    type: "noul",
    instructions: "The customer is explicitly asking for money back",
    criteria: {
      true: "They ask for a refund, a credit, or their money back.",
      false: "They only report a problem, ask a question, or complain.",
    },
  },
  angry: {
    type: "noul",
    instructions: "The customer sounds angry or frustrated",
    criteria: {
      true: "Hostile, sarcastic, shouting, threatening to leave, or openly furious.",
      false: "Calm and matter-of-fact, even when reporting a serious problem.",
    },
  },
} as const;

export type Label = {
  team: keyof typeof TEAMS;
  urgency: number;
  refund_requested: boolean;
  angry: boolean;
};

export type Ticket = { id: number; subject: string; body: string; label: Label };

// The LLM lane cannot take `QUESTIONS` directly, so this renders the same
// criteria into a prompt. Kept next to the source strings on purpose.
export const LLM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["team", "urgency", "refund_requested", "angry"],
  properties: {
    team: { type: "string", enum: Object.keys(TEAMS) },
    urgency: { type: "integer", minimum: 0, maximum: 3 },
    refund_requested: { type: "boolean" },
    angry: { type: "boolean" },
  },
} as const;

export const llmPrompt = (t: { subject: string; body: string }) => `Triage this support ticket.

Subject: ${t.subject}
Body: ${t.body}

Which team should own it?
${Object.entries(TEAMS)
  .map(([k, v]) => `- "${k}": ${v}`)
  .join("\n")}

How urgent is it?
${URGENCY.map((u, i) => `- ${i}: ${u}`).join("\n")}

refund_requested: ${QUESTIONS.refund_requested.criteria.true} (false: ${QUESTIONS.refund_requested.criteria.false})
angry: ${QUESTIONS.angry.criteria.true} (false: ${QUESTIONS.angry.criteria.false})

Answer with JSON only.`;
