// Smoke check for the recorded data. Costs nothing, calls nothing.
// Run: node scripts/check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timeline } from "../web/src/lib/run.ts";
import { QUESTIONS, TEAMS, URGENCY } from "./taxonomy.ts";

const run = JSON.parse(readFileSync("web/public/run.json", "utf8"));
const teams = Object.keys(TEAMS);
const tickets = run.tickets;

// --- dataset
assert.equal(tickets.length, run.dataset.n, "ticket count disagrees with the header");
assert.equal(new Set(tickets.map((t: { id: number }) => t.id)).size, tickets.length, "ticket ids must be unique");
for (const t of tickets) {
  assert.ok(teams.includes(t.label.team), `ticket ${t.id}: unknown team ${t.label.team}`);
  assert.ok(t.label.urgency >= 0 && t.label.urgency < URGENCY.length, `ticket ${t.id}: urgency out of range`);
  assert.ok(t.body.length > 20, `ticket ${t.id}: suspiciously short body`);
}

// --- every side was asked the same thing
assert.deepEqual(Object.keys(QUESTIONS).sort(), ["angry", "refund_requested", "team", "urgency"]);
assert.equal(Object.keys(QUESTIONS).length, run.dataset.questions);

// --- lanes
assert.ok(run.lanes.length >= 2, "a race needs at least two lanes");
assert.equal(run.lanes[0].key, "jev", "jev is expected to be the first lane");
for (const lane of run.lanes) {
  assert.equal(lane.results.length, tickets.length, `${lane.label}: wrong result count`);
  assert.equal(lane.failed, 0, `${lane.label}: ${lane.failed} tickets never got an answer`);
  assert.ok(lane.cost > 0, `${lane.label}: zero cost means the usage numbers are missing`);
  for (const r of lane.results) {
    assert.ok(teams.includes(r.verdict.team), `${lane.label} #${r.id}: unknown team`);
    assert.ok(Number.isInteger(r.verdict.urgency), `${lane.label} #${r.id}: urgency must be an integer`);
    assert.equal(typeof r.verdict.angry, "boolean", `${lane.label} #${r.id}: angry must be boolean`);
  }
  // The replay reconstructs finish times from per-item latency; it has to land on
  // the wall clock actually measured, or the animation is lying.
  const { total } = timeline(lane, run.concurrency);
  const drift = Math.abs(total - lane.wall_ms) / lane.wall_ms;
  assert.ok(drift < 0.05, `${lane.label}: replay timeline is ${(drift * 100).toFixed(1)}% off the measured wall clock`);
}

// --- leave-one-out grading must never let a model grade itself
assert.equal(run.agreement.length, run.lanes.length, "agreement matrix does not match the lanes");
for (let i = 0; i < run.lanes.length; i++)
  assert.equal(run.agreement[i][i], 1, `${run.lanes[i].label} should agree with itself on every ticket`);

const jev = run.lanes[0];
const cheapest = run.lanes.slice(1).reduce((a: { cost: number }, b: { cost: number }) => (a.cost < b.cost ? a : b));
assert.ok(cheapest.cost > jev.cost, "the whole point is that jev is cheaper");

console.log(`ok, ${tickets.length} tickets, ${Object.keys(QUESTIONS).length} questions, ${run.lanes.length} lanes`);
for (const l of run.lanes)
  console.log(
    `   ${l.label.padEnd(18)} ${(l.wall_ms / 1000).toFixed(1).padStart(5)}s  $${l.cost.toFixed(4)}  p50 ${l.latency.p50.toFixed(0).padStart(5)}ms`,
  );
console.log(`   cheapest text model costs ${(cheapest.cost / jev.cost).toFixed(1)}x what jev costs`);
