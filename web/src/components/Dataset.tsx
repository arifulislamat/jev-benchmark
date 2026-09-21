import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TEAM_COLORS, type Run } from "@/lib/run";

const URGENCY_WORD = ["can wait", "today", "blocked", "money burning"];

export function Dataset({ run, onSelect }: { run: Run; onSelect: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return run.tickets.filter(
      (t) =>
        (!team || t.label.team === team) &&
        (!needle || t.subject.toLowerCase().includes(needle) || t.body.toLowerCase().includes(needle)),
    );
  }, [q, team, run.tickets]);

  const teams = Object.keys(TEAM_COLORS);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">The {run.tickets.length} tickets</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Synthetic, written by Claude Haiku 4.5 from a randomly chosen label so that every ticket has a known answer
        before either model sees it. Read a few. The labels are not perfect, which the Method tab goes into, and it is the reason
        the accuracy table grades against two independent judges instead.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search subject and body"
          className="h-9 w-64 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <button
          type="button"
          onClick={() => setTeam(null)}
          className={`rounded-full border px-3 py-1 text-xs ${team === null ? "bg-secondary" : ""}`}
        >
          all
        </button>
        {teams.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(team === t ? null : t)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${team === t ? "bg-secondary" : ""}`}
          >
            <span className={`size-2 rounded-full ${TEAM_COLORS[t]}`} />
            {t}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          {rows.length} of {run.tickets.length}
        </span>
      </div>

      <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border">
        {rows.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className="flex w-full items-start gap-3 border-b p-3 text-left last:border-0 hover:bg-muted/50"
          >
            <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{t.id}</span>
            <span className={`mt-1 size-2 shrink-0 rounded-full ${TEAM_COLORS[t.label.team]}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.subject}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.body}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Badge variant="outline" className="text-[10px]">
                {URGENCY_WORD[t.label.urgency]}
              </Badge>
              {t.label.refund_requested && (
                <Badge variant="secondary" className="text-[10px]">
                  refund
                </Badge>
              )}
              {t.label.angry && (
                <Badge variant="destructive" className="text-[10px]">
                  angry
                </Badge>
              )}
            </span>
          </button>
        ))}
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing matches that.</p>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Badges show the label the ticket was generated from, not what either model answered. Click a row to see both
        answers.
      </p>
    </Card>
  );
}

export function Requests({ requests }: { requests: { jev: unknown; llm: unknown } }) {
  const [tab, setTab] = useState<"jev" | "llm">("jev");
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">What actually went over the wire</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        The real request body for ticket 0, copied out of the run. The difference between the two sides is the whole
        argument: one sends typed questions and gets typed answers, the other sends English and gets a string back that
        has to be parsed before anything downstream can use it.
      </p>
      <div className="mt-4 flex gap-2">
        {(["jev", "llm"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md border px-3 py-1 text-xs ${tab === k ? "bg-secondary" : ""}`}
          >
            {k === "jev" ? "POST /api/alpha/decisions" : "POST /api/v1/chat/completions"}
          </button>
        ))}
      </div>
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
        {JSON.stringify(requests[tab], null, 2)}
      </pre>
    </Card>
  );
}

export function Inspector({ run, id, onClose }: { run: Run; id: number; onClose: () => void }) {
  const t = run.tickets.find((x) => x.id === id);
  if (!t) return null;
  const byId = (lane: Run["lanes"][number]) => lane.results.find((r) => r.id === id);

  return (
    <Card className="border-primary/30 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            #{t.id} {t.subject}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t.body}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            written from label: {t.label.team}, urgency {t.label.urgency}, refund {String(t.label.refund_requested)},
            angry {String(t.label.angry)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          close
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left font-medium text-muted-foreground">model</th>
              <th className="py-2 text-left font-medium text-muted-foreground">team</th>
              <th className="py-2 text-left font-medium text-muted-foreground">urgency <span className="font-normal">0 to 3</span></th>
              <th className="py-2 text-left font-medium text-muted-foreground">refund <span className="font-normal">p</span></th>
              <th className="py-2 text-left font-medium text-muted-foreground">angry <span className="font-normal">p</span></th>
              <th className="py-2 text-right font-medium text-muted-foreground">ms</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {run.lanes.map((lane) => {
              const r = byId(lane);
              const p = r?.raw;
              return (
                <tr key={lane.key} className="border-b last:border-0">
                  <td className="py-2 font-sans font-medium" style={{ color: lane.color }}>
                    {lane.label}
                  </td>
                  <td className="py-2">
                    {r?.verdict?.team}
                    {p && <span className="text-muted-foreground"> {(p.team_confidence * 100).toFixed(0)}%</span>}
                  </td>
                  <td className="py-2">
                    {p ? p.urgency_score.toFixed(2) : r?.verdict?.urgency}
                    <span className="text-muted-foreground"> of 3</span>
                  </td>
                  <td className="py-2">{p ? p.refund_p.toFixed(2) : String(r?.verdict?.refund_requested)}</td>
                  <td className="py-2">{p ? p.angry_p.toFixed(2) : String(r?.verdict?.angry)}</td>
                  <td className="py-2 text-right tabular-nums">{r?.ms.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        The columns carry different units. Urgency is a position on the four level scale, so Jev can answer 1.96,
        meaning almost exactly level 2 with a little weight left on level 1. Refund and angry are probabilities between
        0 and 1. The percentage beside Jev's team is its confidence in that choice. The text models can only emit one
        integer and one boolean, so their rows carry no uncertainty at all, and code downstream cannot tell a sure call
        from a coin flip.
      </p>
    </Card>
  );
}
