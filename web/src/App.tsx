import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccuracyChart,
  AgreementChart,
  CostChart,
  LatencyChart,
  RaceChart,
} from "@/components/charts";
import { Dataset, Requests } from "@/components/Dataset";
import { Questions } from "@/components/Questions";
import { ChartHeading } from "@/components/ChartHeading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cumulative, FIELDS, type Run } from "@/lib/run";
import { modelColor } from "@/lib/presentation";

const REPO = "https://github.com/arifulislamat/jev-benchmark";
const money = (n: number) => `$${n.toFixed(4)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const fieldNames = ["Team", "Urgency", "Refund requested", "Angry"];
const tabs = ["race", "accuracy", "questions", "tickets", "wire", "method"];

export default function App() {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [grading, setGrading] = useState<"consensus" | "spec">("consensus");
  const raf = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}run.json`)
      .then((r) => {
        if (!r.ok) throw new Error("Run unavailable");
        return r.json();
      })
      .then((data: Run) => {
        const end = Math.max(
          ...data.lanes.map((l) => cumulative(l, data.concurrency).at(-1)!.t),
        );
        elapsedRef.current = end;
        setElapsed(end);
        setRun(data);
      })
      .catch(() => setError(true));
  }, []);

  const duration = useMemo(
    () =>
      run
        ? Math.max(
            ...run.lanes.map((l) => cumulative(l, run.concurrency).at(-1)!.t),
          )
        : 0,
    [run],
  );

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(
        duration,
        elapsedRef.current + (now - last) * speed,
      );
      last = now;
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= duration) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, duration]);

  if (error)
    return (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-xl font-semibold">Results could not be loaded</h1>
        <p className="mt-2 text-muted-foreground">
          Please reload the page to try again.
        </p>
      </main>
    );
  if (!run)
    return (
      <main className="p-10 text-sm text-muted-foreground" role="status">
        Loading recorded results…
      </main>
    );

  const tab = new URLSearchParams(location.search).get("tab") ?? "race";

  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#results">
        Skip to results
      </a>
      <div className="report-shell mx-auto max-w-[1080px] px-4 py-4 sm:px-8 md:py-5">
        <nav
          className="mb-5 flex items-center justify-between border-b pb-3 text-xs"
          aria-label="Report links"
        >
          <a
            href={import.meta.env.BASE_URL}
            className="font-semibold tracking-wide"
          >
            JEV{" "}
            <span className="ml-2 font-normal text-muted-foreground">
              / BENCHMARK
            </span>
          </a>
          <div className="flex gap-5">
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="report-link"
            >
              GitHub ↗
            </a>
          </div>
        </nav>

        <header className="mb-4">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight md:text-5xl">
            Typed decisions vs. LLMs
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
            A comparison of Jev and three general-purpose LLMs on the same{" "}
            {run.dataset.n} synthetic support tickets. We measure API cost,
            request latency, and agreement on team assignment, urgency, refund
            requests, and customer anger.
          </p>
        </header>

        <main id="results">
          <Tabs
            defaultValue={tabs.includes(tab) ? tab : "race"}
            onValueChange={(v) => {
              const u = new URL(location.href);
              u.searchParams.set("tab", v);
              history.replaceState(null, "", u);
            }}
          >
            <div className="mb-2 overflow-x-auto border-b pb-1">
              <TabsList variant="line" aria-label="Report sections">
                <TabsTrigger value="race">Overview</TabsTrigger>
                <TabsTrigger value="accuracy">Agreement</TabsTrigger>
                <TabsTrigger value="questions">Task definitions</TabsTrigger>
                <TabsTrigger value="tickets">Dataset</TabsTrigger>
                <TabsTrigger value="wire">API requests</TabsTrigger>
                <TabsTrigger value="method">Methodology</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="race" className="space-y-5">
              <Card className="report-panel">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <ChartHeading title="Completed requests over time">
                    <p>
                      Reconstructed from request timings and concurrency slices.
                      Models ran sequentially, not against each other in real
                      time. Replay makes no API calls.
                    </p>
                  </ChartHeading>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (playing) {
                          setPlaying(false);
                        } else {
                          if (elapsed >= duration) {
                            elapsedRef.current = 0;
                            setElapsed(0);
                          }
                          setPlaying(true);
                        }
                      }}
                    >
                      {playing
                        ? "Pause"
                        : elapsed >= duration
                          ? "Replay run"
                          : "Resume"}
                    </Button>
                    {[1, 5].map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={speed === s ? "secondary" : "ghost"}
                        aria-pressed={speed === s}
                        onClick={() => setSpeed(s)}
                      >
                        {s}×
                      </Button>
                    ))}
                    <span className="min-w-16 text-right font-mono text-xs tabular-nums">
                      {secs(elapsed)}
                    </span>
                  </div>
                </div>
                <RaceChart run={run} elapsed={elapsed} />
              </Card>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="report-panel">
                  <ChartHeading title="API cost per model">
                    <p>
                      Recorded spend for {run.dataset.n} tickets, in USD. All
                      bars start at zero.
                    </p>
                  </ChartHeading>
                  <CostChart run={run} />
                </Card>
                <Card className="report-panel">
                  <ChartHeading title="Request latency distribution">
                    <p>
                      Boxes show the middle 50% of requests and the median.
                      Whiskers show the minimum and maximum, not confidence
                      intervals.
                    </p>
                  </ChartHeading>
                  <LatencyChart run={run} />
                </Card>
              </div>
              <Summary run={run} />
              <p className="study-note border-l-0!">
                <strong>Scope.</strong> These results describe one synthetic
                workload. Latency has not been evaluated across repeated runs.
                Agreement with other models is not evidence of correctness.
              </p>
            </TabsContent>

            <TabsContent value="accuracy" className="space-y-5">
              <Card className="report-panel">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <ChartHeading title="Agreement by question">
                    <p>
                      {grading === "consensus"
                        ? "Each model is compared with the majority of the other three. A field is included only when at least two reference models agree. Each model therefore has a different reference pool."
                        : "Each model is compared with the labels used to generate the tickets. Those labels were not independently verified and may not match the resulting text."}
                    </p>
                    <p>
                      Neither reference is verified ground truth. Consensus
                      measures conformity; generated labels measure agreement
                      with the intended scenario.
                    </p>
                  </ChartHeading>
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label="Grading reference"
                  >
                    <Button
                      size="sm"
                      variant={grading === "consensus" ? "secondary" : "ghost"}
                      aria-pressed={grading === "consensus"}
                      onClick={() => setGrading("consensus")}
                    >
                      Model consensus
                    </Button>
                    <Button
                      size="sm"
                      variant={grading === "spec" ? "secondary" : "ghost"}
                      aria-pressed={grading === "spec"}
                      onClick={() => setGrading("spec")}
                    >
                      Generated labels
                    </Button>
                  </div>
                </div>
                <AccuracyChart run={run} grading={grading} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      {fieldNames.map((f) => (
                        <TableHead key={f} className="text-right">
                          {f}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.lanes.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell className="font-medium">{l.label}</TableCell>
                        {FIELDS.map((f) => {
                          const stat =
                            grading === "consensus"
                              ? l.vs_consensus?.[f]
                              : l.vs_spec[f];
                          return (
                            <TableCell
                              key={f}
                              className="text-right font-mono text-xs whitespace-nowrap"
                            >
                              {stat ? (
                                <>
                                  {pct(stat.acc)}{" "}
                                  <span className="text-muted-foreground">
                                    (n={stat.n})
                                  </span>
                                </>
                              ) : (
                                "N/A"
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              <Card className="report-panel">
                <ChartHeading title="Exact match across all four answers">
                  <p>
                    The share of tickets for which two models returned identical
                    decisions on every field. The diagonal compares each model
                    with itself.
                  </p>
                </ChartHeading>
                <AgreementChart run={run} />
              </Card>
            </TabsContent>
            <TabsContent value="questions">
              {run.questions && <Questions questions={run.questions} />}
            </TabsContent>
            <TabsContent value="tickets" className="space-y-4">
              <Dataset run={run} />
            </TabsContent>
            <TabsContent value="wire">
              {run.requests && <Requests requests={run.requests} />}
            </TabsContent>
            <TabsContent value="method">
              <Method run={run} />
            </TabsContent>
          </Tabs>
        </main>
        <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t pt-5 text-xs text-muted-foreground">
          <p>
            Published by{" "}
            <a
              href="https://www.brillmark.com/"
              target="_blank"
              rel="noreferrer"
              className="report-link"
            >
              BrillMark LLC
            </a>
          </p>
          <p>Recorded results · No live inference in this page</p>
        </footer>
      </div>
    </div>
  );
}

function Summary({ run }: { run: Run }) {
  const rows: [string, (l: Run["lanes"][number]) => string][] = [
    ["Total API cost (USD)", (l) => money(l.cost)],
    [
      "Cost per 1M tickets (estimated)",
      (l) => `$${((l.cost / run.dataset.n) * 1e6).toFixed(2)}`,
    ],
    ["Measured wall time", (l) => secs(l.wall_ms)],
    ["Median request latency", (l) => `${l.latency.p50.toFixed(0)} ms`],
    ["95th percentile latency", (l) => `${l.latency.p95.toFixed(0)} ms`],
    ["Failed requests", (l) => String(l.failed)],
    ["Retries", (l) => String(l.retries)],
  ];
  return (
    <Card className="report-panel">
      <h2>Results at a glance</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            {run.lanes.map((l) => (
              <TableHead key={l.key} className="text-right whitespace-nowrap">
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ background: modelColor(l.key) }}
                />
                {l.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, get]) => (
            <TableRow key={label}>
              <TableCell className="text-muted-foreground">{label}</TableCell>
              {run.lanes.map((l) => (
                <TableCell
                  key={l.key}
                  className="text-right font-mono text-xs tabular-nums"
                >
                  {get(l)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="figure-note">
        The million-ticket estimate scales this run's cost linearly. It is not a
        measured run and excludes infrastructure, volume discounts, and changes
        in ticket length.
      </p>
    </Card>
  );
}

function Method({ run }: { run: Run }) {
  const date = new Date(run.generated_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const sections = [
    [
      "Workload and execution",
      `${run.dataset.n} synthetic tickets, ${run.dataset.questions} questions per ticket, one ticket per request. All models used OpenRouter from one laptop on home broadband at concurrency ${run.concurrency}. Model lanes ran sequentially. This controls the client setup, but not provider load or routing. The page displays one recorded run, not an average of repeated trials.`,
    ],
    [
      "Shared task definitions",
      "Category descriptions come from the same taxonomy file. Jev receives typed questions; LLMs receive the same descriptions in a prompt with a strict JSON schema. LLMs use a 1,500-token output limit and low reasoning effort. The request bodies are available in the API requests tab.",
    ],
    [
      "How agreement is scored",
      "Jev's urgency score is rounded to the nearest integer; refund and anger probabilities are classified as true at 0.5 or above. For each field, each model is then compared with the majority answer of the other three. At least two must agree for the field to count. No model votes on its own answer, but each faces a different reference pool. The Agreement tab reports the included sample counts and also offers comparison with generated labels. Neither is a measure of verified accuracy.",
    ],
    [
      "Synthetic labels",
      "Tickets were generated from assigned labels, not collected from production. The resulting text does not always support the intended label, particularly for team and urgency. Agreement among models cannot resolve this: they may share the same mistakes. Human-reviewed labels would be needed to make claims about correctness.",
    ],
    [
      "Cost and timing",
      "Cost is the API usage cost recorded for this workload. Future costs may change with token usage or pricing. Request latency includes the network round trip. Completion curves are reconstructed from request durations and concurrency slices; measured wall time is reported separately. Boxplot quartiles use the sorted observation at floor(n × p). No confidence intervals or repeated-run latency estimates are reported.",
    ],
    [
      "Limits of this comparison",
      "The findings apply to these models, prompts, and tickets. They do not establish performance on real support queues. Batched LLM requests have not been tested and could change the cost comparison. An earlier 200-token output cap truncated reasoning responses; the recorded configuration uses the higher limit described above.",
    ],
  ];
  return (
    <Card className="report-panel">
      <h2>Methodology and limitations</h2>
      <dl className="mt-2 grid gap-4 border-b pb-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Recorded", `${date} UTC`],
          ["Tickets per model", String(run.dataset.n)],
          ["Concurrency", String(run.concurrency)],
          ["Run count", "Single recorded run"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 divide-y">
        {sections.map(([title, text], i) => (
          <section
            key={title}
            className="grid gap-2 py-5 sm:grid-cols-[210px_1fr]"
          >
            <h3 className="text-sm font-medium">
              <span className="mr-3 font-mono text-xs text-muted-foreground">
                0{i + 1}
              </span>
              {title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {text}
            </p>
          </section>
        ))}
      </div>
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium">Model identifiers</h3>
        <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
          {run.lanes.map((l) => (
            <li key={l.key}>{l.model}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
