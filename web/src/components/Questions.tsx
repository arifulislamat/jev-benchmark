import { Card } from "@/components/ui/card";
import type { Question } from "@/lib/run";

const EXPLANATIONS: Record<
  string,
  { title: string; summary: string; jev: string; text: string }
> = {
  team: {
    title: "Which team should handle this ticket?",
    summary: "Choose billing, technical support, account support, or sales.",
    jev: "One team, with a probability for each option and confidence in the choice.",
    text: "One team name.",
  },
  urgency: {
    title: "How urgent is it?",
    summary:
      "Place the issue on a four-level scale, from 0 (lowest urgency) to 3 (highest urgency).",
    jev: "A score from 0 to 3 that can include decimals, plus confidence.",
    text: "A whole number from 0 to 3.",
  },
  refund_requested: {
    title: "Is the customer asking for a refund?",
    summary: "Identify a request for money back using the definition below.",
    jev: "A probability from 0 to 1.",
    text: "True or false.",
  },
  angry: {
    title: "Does the customer sound angry?",
    summary:
      "Assess the tone of the message, separately from how urgent the issue is.",
    jev: "A probability from 0 to 1.",
    text: "True or false.",
  },
};

function Criteria({ q }: { q: Question }) {
  const entries = Array.isArray(q.criteria)
    ? q.criteria.map((value, i) => [String(i), value])
    : Object.entries(q.criteria);
  return (
    <dl className="criteria-list">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key === "true" ? "Yes" : key === "false" ? "No" : key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Questions({
  questions,
}: {
  questions: Record<string, Question>;
}) {
  return (
    <section className="space-y-5" aria-labelledby="questions-heading">
      <div>
        <h2 id="questions-heading" className="text-2xl font-semibold">
          Four questions for each ticket
        </h2>
        <p className="mt-2 max-w-3xl text-muted-foreground leading-relaxed">
          Every model answers the same four questions in one request. The
          descriptions are shared; the output formats differ.
        </p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {Object.entries(questions).map(([key, q]) => {
          const explanation = EXPLANATIONS[key];
          return (
            <Card key={key} className="report-panel question-card">
              <h3 className="text-xl font-semibold">
                {explanation?.title ?? key}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {explanation?.summary ?? q.instructions}
              </p>
              <dl className="answer-formats">
                <div>
                  <dt>Jev returns</dt>
                  <dd>{explanation?.jev ?? q.type}</dd>
                </div>
                <div>
                  <dt>LLMs return</dt>
                  <dd>
                    {explanation?.text ?? "A value in the JSON response."}
                  </dd>
                </div>
              </dl>
              <details className="question-definitions">
                <summary>Read the exact definition</summary>
                <p className="mt-4 leading-relaxed">{q.instructions}</p>
                <Criteria q={q} />
                <p className="mt-4 text-sm text-muted-foreground">
                  API field: <code>{key}</code> · Jev type:{" "}
                  <code>{q.type}</code>
                </p>
              </details>
            </Card>
          );
        })}
      </div>
      <p className="study-note">
        For agreement scoring, Jev's urgency score is rounded to the nearest
        whole number. Refund and anger probabilities of 0.5 or higher count as
        “true.” These rules make the answers comparable; they do not test
        whether the probabilities are well calibrated.
      </p>
    </section>
  );
}
