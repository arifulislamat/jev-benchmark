import { useEffect, useMemo, useRef, useState } from "react";
import { AccuracyChart, AgreementChart, CostChart, LatencyChart, RaceChart } from "@/components/charts";
import { Dataset, Inspector, Requests } from "@/components/Dataset";
import { Questions } from "@/components/Questions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cumulative, type Run } from "@/lib/run";

const money = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export default function App() {
  const [run, setRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [selected, setSelected] = useState<number | null>(null);
  const raf = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}run.json`)
      .then((r) => r.json())
      .then(setRun);
  }, []);

  const duration = useMemo(() => {
    if (!run) return 0;
    return Math.max(...run.lanes.map((l) => cumulative(l, run.concurrency).at(-1)!.t));
  }, [run]);

  useEffect(() => {
    if (duration && new URLSearchParams(location.search).has("done")) {
      elapsedRef.current = duration;
      setElapsed(duration);
    }
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(duration, elapsedRef.current + (now - last) * speed);
      last = now;
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= duration) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, duration]);

  if (!run) return <div className="p-10 text-sm text-muted-foreground">Loading the run.</div>;

  const done = elapsed >= duration && elapsed > 0;
  const jev = run.lanes[0];
  const cheapest = run.lanes.slice(1).reduce((a, b) => (a.cost < b.cost ? a : b));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-10 md:py-16">
        <header className="mb-8">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            One returns text you have to parse. The other returns a decision.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Four questions about every support ticket that lands: who owns it, how urgent it is, are they asking for
            money back, are they angry. That is deciding, not writing. Here are {run.dataset.n} tickets through Jev and
            through the workhorse model from each of the three big labs in strict JSON mode. The cheapest of those
            still costs{" "}
            <strong className="text-foreground">{(cheapest.cost / jev.cost).toFixed(0)}x</strong> what Jev costs, and
            none of them is more than a few points more accurate.
          </p>
        </header>

        <Tabs
          defaultValue={new URLSearchParams(location.search).get("tab") ?? "race"}
          onValueChange={(v) => {
            const u = new URL(location.href);
            u.searchParams.set("tab", v);
            history.replaceState(null, "", u);
          }}
        >
          <TabsList>
            <TabsTrigger value="race">The race</TabsTrigger>
            <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="wire">Request</TabsTrigger>
            <TabsTrigger value="method">Method</TabsTrigger>
          </TabsList>

          <TabsContent value="race" className="space-y-4">
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    elapsedRef.current = 0;
                    setElapsed(0);
                    setPlaying(true);
                  }}
                  disabled={playing}
                >
                  {done ? "Play it again" : "Run the race"}
                </Button>
                {[1, 5].map((s) => (
                  <Button key={s} size="sm" variant={speed === s ? "secondary" : "ghost"} onClick={() => setSpeed(s)}>
                    {s}x
                  </Button>
                ))}
                <span className="ml-auto font-mono text-2xl font-semibold tabular-nums">{secs(elapsed)}</span>
              </div>
              <RaceChart run={run} elapsed={elapsed} />
            </Card>

            {done && (
              <>
                <Card className="p-5">
                  <h2 className="text-lg font-semibold">What the same job costs</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Linear scale, and Jev's bar is the sliver at the bottom. It bills input only, at $0.042 per
                    million tokens, and charges nothing at all for output.
                  </p>
                  <CostChart run={run} />
                </Card>

                <Card className="p-5">
                  <h2 className="text-lg font-semibold">Latency per request</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Box covers the middle half of requests, whiskers reach the fastest and slowest. Measured at
                    concurrency {run.concurrency} over home broadband, so every number here includes the round trip.
                  </p>
                  <LatencyChart run={run} />
                </Card>

                <Summary run={run} />
              </>
            )}
          </TabsContent>

          <TabsContent value="accuracy" className="space-y-4">
            <Card className="p-5">
              <h2 className="text-lg font-semibold">Accuracy per question</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Every model is graded against what the other three agreed on, so nothing votes on its own answer. A
                field counts only where at least two of the other models said the same thing, which here covers{" "}
                {pct(run.consensus_coverage.team)} of tickets on team.
              </p>
              <AccuracyChart run={run} />
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold">How often two models say exactly the same thing</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                All four questions identical, per pair of models. The models disagree with each other about as much as
                any of them disagrees with Jev, which is the honest way to read the accuracy chart above.
              </p>
              <AgreementChart run={run} />
            </Card>
          </TabsContent>

          <TabsContent value="questions">{run.questions && <Questions questions={run.questions} />}</TabsContent>

          <TabsContent value="tickets" className="space-y-4">
            {selected !== null && <Inspector run={run} id={selected} onClose={() => setSelected(null)} />}
            <Dataset run={run} onSelect={setSelected} />
          </TabsContent>

          <TabsContent value="wire">{run.requests && <Requests requests={run.requests} />}</TabsContent>

          <TabsContent value="method">
            <Method run={run} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Summary({ run }: { run: Run }) {
  const rows: [string, (l: Run["lanes"][number]) => string][] = [
    ["Wall clock", (l) => secs(l.wall_ms)],
    ["Total cost", (l) => money(l.cost)],
    ["Same job at a million tickets", (l) => money((l.cost / run.dataset.n) * 1e6)],
    ["Median latency", (l) => `${l.latency.p50.toFixed(0)}ms`],
    ["Slowest request", (l) => `${l.latency.max.toFixed(0)}ms`],
    ["Answers that failed to parse", (l) => String(l.failed)],
    ["Retries needed", (l) => String(l.retries)],
  ];
  return (
    <Card className="p-5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {run.lanes.map((l) => (
              <TableHead key={l.key} style={{ color: l.color }}>
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
                <TableCell key={l.key} className="font-mono tabular-nums">
                  {get(l)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function Method({ run }: { run: Run }) {
  return (
    <Card className="space-y-3 p-5 text-sm text-muted-foreground">
      <h2 className="text-lg font-semibold text-foreground">How this was run</h2>
      <p>
        Recorded {new Date(run.generated_at).toLocaleString()} at concurrency {run.concurrency} from one laptop on home
        broadband, every lane through OpenRouter on one key so the network path is the same for all of them. Lanes ran
        one after another, never at the same time, so they were not competing for sockets. Cost is deterministic and
        repeats exactly. Latency is not, and moved by several seconds between runs.
      </p>
      <p>
        The three text models are the workhorse tier from each lab rather than the flagship or the nano tier:{" "}
        {run.lanes
          .slice(1)
          .map((l) => l.model)
          .join(", ")}
        . All of them ran with a strict JSON schema and a low reasoning effort, since triage does not need deep
        reasoning and reasoning tokens are billed like any other.
      </p>
      <p>
        Accuracy is graded leave-one-out: each model is scored against the majority answer of the other three, so no
        model grades itself. An earlier version of this page used frontier models as judges, which cost more than the
        race they were grading and told us little the contestants could not tell us themselves.
      </p>
      <p>
        Both sides read their category descriptions from the same file. If the two halves of a comparison get different
        words for the same category, the comparison measures the wording rather than the models.
      </p>
      <p>
        The tickets are synthetic, written from a randomly chosen label so each has a known answer before any contestant
        sees it. Those labels are the weak part, especially on urgency, where the writer often produced a ticket that
        reads more urgent than the level it was told to write. That is why the accuracy chart grades against model
        consensus rather than against the labels.
      </p>
      <p>
        One trap worth repeating, because it cost a full run: capping output at 200 tokens truncated the reasoning
        models mid-thought, and the truncated text failed to parse. That looked exactly like a model failure and was
        entirely my own configuration.
      </p>
    </Card>
  );
}
