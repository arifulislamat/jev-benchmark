# jev-benchmark

One job, measured end to end: **100 support tickets, four questions each, four models.** Not a leaderboard and not a general capability score. It answers one narrow question, what a real triage workload costs and how long it takes when the model returns a typed decision instead of text, and it shows every number's working so you can disagree with it precisely.

100 support tickets. Four questions each. Four ways to answer them:

- **Jev** (`typesafe/jev-1.13`) through OpenRouter's decisions endpoint. Returns a typed decision with probabilities.
- **Claude Sonnet 5**, **GPT-5.6 Sol**, **Gemini 3.8 Flash** in strict JSON mode. Return text that you parse and hope validates.

The three text models are the workhorse tier from each lab, not the flagship and not the nano tier. Same tickets, same questions, same criteria strings, same concurrency, same machine, one OpenRouter key.

## Result

| | Jev | Sonnet 5 | GPT-5.6 Sol | Gemini 3.8 Flash |
|---|---|---|---|---|
| Total cost | **$0.0031** | $0.1990 | $0.1107 | $0.0896 |
| Per million tickets | **$31** | $1,990 | $1,107 | $896 |
| Wall clock | **6.9s** | 18.0s | 18.4s | 46.3s |
| Median latency | **560ms** | 2677ms | 2349ms | 3940ms |
| Failed to parse | 0 | 0 | 0 | 0 |

The cheapest text model costs **29x** what Jev costs. The most expensive costs 64x.

Accuracy is close. Graded leave-one-out, so each model is scored against the majority answer of the other three, Jev lands within a few points everywhere: 94% on routing against 88 to 96 for the others, 99% on refund detection, 90% on sentiment. It trails on urgency, which is the question the models disagree about most among themselves.

The number worth staring at is the agreement matrix. The three text models give identical answers to each other on 56 to 72 percent of tickets. They are not converging on one right answer, so "accuracy" here means agreement with a rough consensus and nothing stronger.

## Layout

```
scripts/taxonomy.ts     the label space and prompt, imported by every other script
scripts/probe.ts        one call, all three question types, raw response
scripts/gen-tickets.ts  builds data/tickets.json from known labels
scripts/race.ts         runs every lane, writes web/public/run.json
scripts/check.ts        offline smoke check over the recorded data
web/                    replay of the recorded run (Vite, React, shadcn, ECharts)
```

No build step for the scripts. Node 24 runs TypeScript directly.

## Running it

Free, offline, no API key. Validates the recorded run:

```bash
node scripts/check.ts
cd web && pnpm install && pnpm dev
```

Costs money:

```bash
echo 'OPENROUTER_API_KEY=sk-or-v1-...' > .env

node --env-file=.env scripts/probe.ts        # ~$0.00002, one call, prints the wire format
node --env-file=.env scripts/gen-tickets.ts  # ~$0.15, 40s, regenerates the dataset
node --env-file=.env scripts/race.ts         # ~$0.40, 2min, four lanes over 100 tickets
```

Every lane caches to `data/phase-*.json`, so re-running only pays for lanes that have not run. `FORCE=1` re-runs everything, `N=200` changes the ticket count.

## Method

Tickets are synthetic, written by an LLM **from** a randomly chosen label, so ground truth exists without hand annotation. Treat that label as a floor rather than a verdict: where the contestants agree against it, the label is usually the thing that is wrong. This shows up worst on urgency, where the writer routinely produced a ticket that reads more urgent than the level it was told to write.

Accuracy is therefore graded leave-one-out: each model is scored against the majority answer of the other three, and no model votes on its own answer. Frontier judges are supported but off by default, because they cost more than the race they grade:

```bash
JUDGES=openai/gpt-6-astra,anthropic/claude-opus-5 node --env-file=.env scripts/race.ts
```

Both sides read their category descriptions from the same `scripts/taxonomy.ts`. If the two halves of a comparison get different words for the same category, the comparison measures the wording.

Every text lane runs with a strict JSON schema, `max_tokens: 1500`, and low reasoning effort, uniformly.

## Known limits

- One run on one laptop. Latency includes the network round trip and varies by seconds between runs. Cost is deterministic, latency is not.
- Synthetic tickets are cleaner than real ones.
- Prompt caching would not help the text lanes here. The static prefix is roughly 500 tokens, below the minimum cacheable prefix.
- An earlier run capped output at 200 tokens, which truncated the reasoning models mid-thought and produced 88 parse failures that looked exactly like a model defect. They were a configuration defect. If you swap models, check `finish_reason` before believing a failure rate.

## License

MIT. The generated tickets in `data/tickets.json` and the recorded run in `web/public/run.json` are covered by it too, so reuse them freely.
