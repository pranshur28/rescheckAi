// Validates that test-clips/ground-truth.json conforms to the issue #15
// constraints AND uses only enum values defined in lib/types.ts. If a future
// PRD change renames an IncidentType or OriginalRefereeDecision, this test
// fails before the eval script silently mismatches.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  IncidentType,
  OriginalRefereeDecision,
  Verdict,
} from "../lib/types.ts";

interface GroundTruthEntry {
  id: string;
  filename: string;
  description: string;
  original_referee_decision: OriginalRefereeDecision;
  expected_incident_type: IncidentType;
  expected_law: string;
  expected_verdict: Verdict;
  notes: string;
}

const VALID_INCIDENT_TYPES = new Set<IncidentType>([
  "foul",
  "handball",
  "offside",
  "penalty_kick",
  "free_kick",
  "throw_in",
  "goal_kick",
  "corner_kick",
  "ball_in_out",
  "unsupported",
  "unknown",
]);

const VALID_DECISIONS = new Set<OriginalRefereeDecision>([
  "foul_called",
  "no_foul_called",
  "penalty_awarded",
  "no_penalty_awarded",
  "offside_called",
  "goal_allowed",
  "goal_disallowed",
  "throw_in_awarded",
  "goal_kick_awarded",
  "corner_kick_awarded",
  "free_kick_awarded",
  "yellow_card_given",
  "red_card_given",
  "unknown",
]);

const VALID_VERDICTS = new Set<Verdict>(["correct_call", "bad_call", "inconclusive"]);

const VALID_LAWS = new Set([
  "",
  "Law 9",
  "Law 11",
  "Law 12",
  "Law 13",
  "Law 14",
  "Law 15",
  "Law 16",
  "Law 17",
]);

const path = join(process.cwd(), "test-clips", "ground-truth.json");
const data = JSON.parse(readFileSync(path, "utf8")) as GroundTruthEntry[];

test("ground-truth.json has 8-10 entries (issue #15 constraint)", () => {
  assert.ok(
    data.length >= 8 && data.length <= 10,
    `expected 8-10 entries, got ${data.length}`,
  );
});

test("ground-truth.json covers ≥4 distinct laws (issue #15 constraint)", () => {
  const laws = new Set(data.map((e) => e.expected_law).filter((l) => l !== ""));
  assert.ok(laws.size >= 4, `expected ≥4 distinct laws, got ${laws.size}: ${[...laws].sort().join(", ")}`);
});

test("ground-truth.json contains ≥1 inconclusive entry (issue #15 constraint)", () => {
  const inconclusives = data.filter((e) => e.expected_verdict === "inconclusive");
  assert.ok(inconclusives.length >= 1, "expected ≥1 inconclusive verdict in test set");
});

for (const entry of data) {
  test(`entry ${entry.id}: schema is valid`, () => {
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.filename, "string");
    assert.equal(typeof entry.description, "string");
    assert.ok(VALID_DECISIONS.has(entry.original_referee_decision), `bad decision: ${entry.original_referee_decision}`);
    assert.ok(VALID_INCIDENT_TYPES.has(entry.expected_incident_type), `bad incident: ${entry.expected_incident_type}`);
    assert.ok(VALID_LAWS.has(entry.expected_law), `bad law: ${entry.expected_law}`);
    assert.ok(VALID_VERDICTS.has(entry.expected_verdict), `bad verdict: ${entry.expected_verdict}`);
    assert.equal(typeof entry.notes, "string");
  });
}

test("ground-truth ids are unique", () => {
  const ids = data.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids in: ${ids.join(", ")}`);
});

test("filename matches id pattern", () => {
  for (const e of data) {
    assert.match(e.filename, new RegExp(`^${e.id}-[a-z0-9-]+\\.(mp4|mov|webm)$`));
  }
});
