import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Question } from "@/lib/run";

const TYPE_NOTE: Record<string, string> = {
  choice: "pick one option, returns the winner plus a probability for every option",
  score: "place it on an ordered scale, returns a fractional position plus a confidence",
  noul: "yes or no, returns a single probability between 0 and 1",
};

function Criteria({ q }: { q: Question }) {
  if (q.type === "score")
    return (
      <ol className="mt-2 space-y-1">
        {q.criteria.map((c, i) => (
          <li key={c} className="flex gap-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">{i}</span>
            <span>{c}</span>
          </li>
        ))}
      </ol>
    );
  return (
    <dl className="mt-2 space-y-1">
      {Object.entries(q.criteria).map(([k, v]) => (
        <div key={k} className="flex gap-2 text-sm">
          <dt className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Questions({ questions }: { questions: Record<string, Question> }) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">The four questions</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Every ticket gets these same four questions. Jev takes all four in one request and answers them together. The
        wording below is the literal text both models receive, read from one shared file so neither side gets a kinder
        version of the question.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {Object.entries(questions).map(([key, q]) => (
          <div key={key} className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <code className="text-sm font-semibold">{key}</code>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {q.type}
              </Badge>
            </div>
            <p className="mt-2 text-sm">{q.instructions}</p>
            <Criteria q={q} />
            <p className="mt-3 text-xs text-muted-foreground">{TYPE_NOTE[q.type]}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
