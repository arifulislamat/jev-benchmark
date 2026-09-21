# AGENTS.md

Notes for whoever picks this up next, human or model. Written after the first build session.

## What this is for

Measure what a real triage workload costs and how long it takes when the model returns a typed decision instead of text. The deliverable is a benchmark whose numbers survive hostile scrutiny, so methodology defensibility beats extra features every time. If you find yourself choosing between a nicer chart and a more honest number, take the number.

Live demo: https://arifulislamat.github.io/jev-benchmark/
Repo: https://github.com/arifulislamat/jev-benchmark

## What Jev is

Not a text model. You POST app state plus typed questions and get typed answers with probabilities. Three question types, and that is the entire API.

| Type | Returns |
|---|---|
| `choice` | winner, full probability distribution, confidence. Up to 255 options |
| `score` | fractional position on a 2 to 10 level scale, per-level probabilities, confidence |
| `noul` | a single probability between 0 and 1 |

```
POST https://openrouter.ai/api/alpha/decisions
{ "model": "typesafe/jev-1.13", "state": {...}, "questions": { "team": {"type":"choice","instructions":"...","criteria":{...}} } }
```

Response shape, confirmed live by `scripts/probe.ts`:

```json
{ "model": "typesafe/jev-1.13-20260917",
  "answers": {
    "team":    { "type":"choice", "choice":"billing", "probabilities":{...}, "confidence":1 },
    "urgency": { "type":"score", "score":1.11, "legend":{"0":"...","1":"..."}, "probabilities":{...}, "confidence":0.83 },
    "refund":  { "type":"noul", "noul":0.99 } },
  "usage": { "input_tokens":549, "output_tokens":70, "cost":0.000023058 },
  "id": "gen-dec-...", "provider": "TypeSafe" }
```

$0.042 per million input tokens, output free, 32k context on OpenRouter (64k direct). `score` is 0-indexed and fractional, so a 4-level scale answers 0 to 3 and 1.96 means "almost exactly level 2". `noul` carries no confidence field, only the probability.

Documented failure modes worth respecting: cannot count or do date math, reads negations literally, accuracy degrades when you pad state with irrelevant material, and state is not sanitized against prompt injection.

## Layout and data flow

```
scripts/taxonomy.ts    questions, criteria, AND the LLM prompt. One source for both sides
       │
       ├─> gen-tickets.ts ──> data/tickets.json          200 tickets, already generated
       │
       └─> race.ts ─────────> data/phase-<lane>-<N>.json  one cache per model
                    └───────> web/public/run.json          everything the site reads
                                     │
       check.ts validates ───────────┤
       web/ replays ─────────────────┘
```

The web app never calls an API. It fetches `run.json` and replays it. Timings are reconstructed by `timeline()` in `web/src/lib/run.ts` from per-request latency plus the concurrency slicing, and `check.ts` asserts that reconstruction lands within 5% of the measured wall clock, so the animation cannot lie about the race.

Root has no package.json. Node 24 runs the `.ts` scripts directly with zero dependencies. Only `web/` has a package.json.

## Commands

Free, no key needed:

```bash
node scripts/check.ts          # validates whatever is recorded, run this after any data change
cd web && pnpm dev             # http://localhost:5173
```

Costs money:

```bash
node --env-file=.env scripts/probe.ts        # ~$0.00002, best way to see the wire format
node --env-file=.env scripts/gen-tickets.ts  # ~$0.15, 40s
node --env-file=.env scripts/race.ts         # ~$0.40, 2min, four lanes over 100 tickets
```

Env knobs: `N=50` ticket count, `FORCE=1` ignore caches, `JUDGES=model1,model2` add frontier judges (off by default).

Lane caches are keyed `phase-<label>-<N>.json`. Rebuilding `run.json` from caches is free and takes 60ms, so iterating on metrics or charts costs nothing. Only new lanes cost money. Delete one cache file to re-run just that lane.

## Current results

100 tickets, 4 questions, recorded 2026-09-21.

| | Jev | Sonnet 5 | GPT-5.6 Sol | Gemini 3.8 Flash |
|---|---|---|---|---|
| cost | $0.0031 | $0.1990 | $0.1117 | $0.0960 |
| wall | 8.0s | 18.0s | 23.1s | 66.8s |
| p50 | 474ms | 2479ms | 1937ms | 3459ms |
| failures | 0 | 0 | 0 | 0 |

Cheapest text model is 31x Jev's cost, most expensive 65x.

## Methodology decisions, and why

**One taxonomy file.** `scripts/taxonomy.ts` holds the questions, the criteria strings, `LLM_SCHEMA` and `llmPrompt()`. Jev gets the `QUESTIONS` object; the text models get the same strings rendered into a prompt. If the two sides ever get different wording, the benchmark measures the wording rather than the models. Do not let these drift apart.

**Leave-one-out consensus.** Each model is graded against the majority answer of the other three, and a field only counts when at least two of them agree. No model grades itself. Note the asymmetry: each model faces a slightly different reference pool, since its own vote is removed.

This metric measures conformity, not truth. A model that is right when the other three are wrong scores as wrong. Say so plainly wherever the number appears.

**The generated labels are the weak part.** `vs_spec` is still computed and stored. Compare the two gradings:

```
                team   urgency   refund   angry
consensus Jev   93.0%    72.0%    99.0%   89.0%
spec      Jev   76.0%    48.0%    98.0%   94.0%
```

All four models score 72 to 78 on team and 46 to 48 on urgency against the labels, but 88 to 94 and 70 to 82 against each other, while refund and angry barely move. Four independent models failing the same way on exactly two of four questions is evidence the labels are wrong, not the models. It is the clearest evidence in the project that the ground truth was the problem.

**Judges are opt-in.** An earlier version used GPT-6 Astra and Opus 5 as graders. They cost more than the race they graded and blew the key limit. Do not add frontier models without asking first.

## Gotchas that cost real time

**`max_tokens: 200` truncated the reasoning models mid-thought.** Gemini 3.8 Flash spent 192 of 196 completion tokens reasoning, hit the cap, and returned the string `"Here is the"`, which failed to parse. It produced an 88% failure rate that looked exactly like a model defect and was entirely configuration. The same cap broke the Opus judge on 15 and the Gemini judge on 98. Now `max_tokens: 1500` plus `reasoning: { effort: "low" }` uniformly. **If you swap in a model and see a failure rate, check `finish_reason` before believing it.**

**`JSON.parse` can succeed and still not give you an object.** A judge returned the literal document `null`, which parses cleanly then throws on the first property read. `race.ts` now checks `typeof verdict !== "object" || verdict === null || Array.isArray(verdict)` before touching fields. Parsing is not validating.

**`Array.prototype.map` passes the index as the second argument.** `slice.map(fn)` where `fn` is `(t, attempt = 0)` silently fed the loop index into the retry counter, so items past position 2 in each slice lost their retry budget. Always `slice.map((t) => fn(t))`.

**`minItems` / `maxItems` are not enforced** in OpenRouter strict JSON schema. Asking for 10 tickets per call returned 12 on 11 of 20 batches. The fix was one item per call, which removed the failure mode instead of retrying it.

**Log-scale bar charts are wrong.** A bar's baseline is zero and log(0) is undefined, so ECharts drew the cheapest lane as the longest bar. Use linear. Jev's bar being a sliver is the honest picture.

**OpenRouter 402 and 403 are billing, not bad luck.** `race.ts` throws immediately on them instead of burning the retry budget.

## Environment specifics

- Never echo or search the API key file. It is gitignored and stays that way. Some tooling refuses a shell command that merely mentions it alongside a search command, so edit it in place rather than reading it back.
- No Playwright or chromium-cli installed. Screenshots use `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --screenshot`. Playwright browsers do exist in `~/Library/Caches/ms-playwright` if you ever need them.
- `vite preview` binds to `[::1]`, so `curl 127.0.0.1:4173` fails while `localhost:4173` works.
- The page loads in the finished state, so `?done=1` is gone. `?tab=<name>` still opens a tab, which is how headless screenshots reach any section without clicking.
- lucide-react 1.47 has no brand icons. The GitHub mark is inlined SVG in `App.tsx`.
- shadcn 4.x init flags changed: `pnpm dlx shadcn@latest init -b radix -t vite -p nova --no-monorepo --yes`. `-b` is the component library now, not the base color.
- `baseUrl` in tsconfig is deprecated in TS 7 and fails the build. `paths` works without it.
- Vite `base: "./"` so Pages works under any repo name.

## Deployment

`.github/workflows/pages.yml` builds `web/` and deploys on push to main or master. Pages had to be enabled once via `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`; the workflow cannot do that itself and the first deploy failed until it was set.

`web/public/og.png` is the social card, generated by screenshotting the finished page at 1200x630. It goes stale if the headline changes, so regenerate it when the hero copy changes.

## House style

- **No em dashes anywhere.** Not in UI copy, not in the README, not in commit messages, not in chat replies. Use commas, colons, periods.
- Prose should read like a person wrote it. Avoid the usual model tells: inflated significance, "not just X but Y", rule-of-three lists, stock words like delve, robust, seamless, leverage.
- Plain commit messages, no trailers.
- API spend is real money. Confirm before anything beyond small change, and state the cost up front.
- Keep the UI compact. Charts on the main tab, supporting material behind tabs. That layout was arrived at by feedback, do not undo it.

## Open items

- Latency needs repeat runs and a median. It moved by several seconds between runs and the current figure is a single sample.
- Cost is not quite deterministic either. Across two runs of the same 100 tickets, Jev and Sonnet repeated to the cent, while GPT moved $0.1107 to $0.1117 and Gemini $0.0896 to $0.0960. The input side is fixed; reasoning tokens are not. Say "recorded" rather than "deterministic" when describing the cost figures.
- A batched-LLM lane, 20 tickets per call, is the strongest untested objection to the current setup. It is also where JSON mode visibly breaks, as the dataset generation already showed.
- No dark mode. The chart palette is validated for it, but nothing switches yet.
- ECharts pushes the bundle to 957KB, 317KB gzipped.
