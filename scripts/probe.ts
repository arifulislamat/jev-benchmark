// Probe: one call, all three question types, dump the raw wire response.
// Run: node --env-file=.env scripts/probe.ts
const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "typesafe/jev-1.13",
    state: {
      ticket: {
        subject: "Charged twice for order A-104",
        body: "I was billed $49 twice this morning. Refund the duplicate today please, this is the second time it has happened.",
      },
      order: { id: "A-104", charges: [{ usd: 49 }, { usd: 49 }] },
      policy: "Duplicate charges are eligible for an immediate refund.",
    },
    questions: {
      team: {
        type: "choice",
        instructions: "Which team should own this ticket?",
        criteria: {
          billing: "Payment, refunds, or subscription issues.",
          technical: "Bugs or broken product behaviour.",
          sales: "Pricing or new account questions.",
        },
      },
      urgency: {
        type: "score",
        instructions: "How urgent is this ticket?",
        criteria: [
          "Can wait for next week",
          "Should be handled today",
          "Money is moving right now, handle immediately",
        ],
      },
      refund_requested: {
        type: "noul",
        instructions: "The customer is explicitly asking for a refund",
        criteria: {
          true: "They ask for money back.",
          false: "They only report a problem or ask a question.",
        },
      },
    },
  }),
});

console.log(res.status, res.statusText);
console.log(JSON.stringify(await res.json(), null, 2));
