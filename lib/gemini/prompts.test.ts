// Verifies that the few-shot examples baked into pass2VerdictPrompt clear
// the same validator that grades real model output. If a future edit breaks
// quoted_rule fidelity or invents a chunk id, this test catches it before
// the model is taught the bad pattern.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PASS_2_FEW_SHOTS,
  PROMPT_VERSION,
  pass2VerdictPrompt,
} from "./prompts.ts";
import type { IncidentType } from "../types.ts";
import type { RetrievedChunk } from "../retrieval/types.ts";
import {
  normalizeForQuoteMatch,
  quotedRuleAppearsInChunks,
} from "../validation.ts";

interface FallbackRecord {
  id: string;
  law_number: string;
  law_title: string;
  section: string;
  text: string;
}

const fallbackPath = join(process.cwd(), "data", "ifab-rules-fallback.json");
const fallback = JSON.parse(readFileSync(fallbackPath, "utf8")) as FallbackRecord[];
const byId = new Map(fallback.map((r) => [r.id, r]));

const ACTIVE_INCIDENT_TYPES: IncidentType[] = [
  "foul",
  "handball",
  "offside",
  "penalty_kick",
  "free_kick",
  "throw_in",
  "goal_kick",
  "corner_kick",
  "ball_in_out",
];

test("PROMPT_VERSION is the bumped p1.x.x version", () => {
  assert.match(PROMPT_VERSION, /^p1\.\d+\.\d+$/);
});

test("every active incident type has a few-shot example", () => {
  for (const t of ACTIVE_INCIDENT_TYPES) {
    assert.ok(PASS_2_FEW_SHOTS[t], `missing few-shot for ${t}`);
  }
});

test("inconclusive few-shot example exists (offside obstructed)", () => {
  // The inconclusive anchor lives in the offside slot per
  // PRD §11.8 / issue #10 DoD ("at least 1 inconclusive example, e.g. an
  // offside where camera angle is obstructed").
  const offside = PASS_2_FEW_SHOTS.offside;
  assert.ok(offside);
  assert.equal((offside.output as { verdict: string }).verdict, "inconclusive");
});

for (const t of ACTIVE_INCIDENT_TYPES) {
  test(`few-shot for ${t}: retrieved_chunk_ids exist in fallback`, () => {
    const ex = PASS_2_FEW_SHOTS[t];
    assert.ok(ex);
    const rule = (ex.output as { rule_applied: { retrieved_chunk_ids: string[] } })
      .rule_applied;
    assert.ok(rule, `${t} example has no rule_applied`);
    for (const id of rule.retrieved_chunk_ids) {
      assert.ok(byId.has(id), `${t} example references unknown chunk id "${id}"`);
    }
  });

  test(`few-shot for ${t}: quoted_rule appears verbatim in retrieved chunk`, () => {
    const ex = PASS_2_FEW_SHOTS[t];
    assert.ok(ex);
    const rule = (
      ex.output as {
        rule_applied: {
          retrieved_chunk_ids: string[];
          quoted_rule: string;
        };
      }
    ).rule_applied;
    const referencedChunks: RetrievedChunk[] = rule.retrieved_chunk_ids
      .map((id) => byId.get(id))
      .filter((r): r is FallbackRecord => Boolean(r))
      .map((r) => ({
        id: r.id,
        law_number: r.law_number,
        law_title: r.law_title,
        section: r.section,
        text: r.text,
      }));
    assert.ok(
      quotedRuleAppearsInChunks(rule.quoted_rule, referencedChunks),
      `${t}: quoted_rule "${normalizeForQuoteMatch(rule.quoted_rule).slice(0, 60)}…" not found in referenced chunks`,
    );
  });

  test(`few-shot for ${t}: reasoning is exactly 5 steps`, () => {
    const ex = PASS_2_FEW_SHOTS[t];
    assert.ok(ex);
    const reasoning = (ex.output as { reasoning: string[] }).reasoning;
    assert.equal(reasoning.length, 5, `${t} reasoning length should be 5`);
  });
}

test("pass2VerdictPrompt includes the matching few-shot for the incident type", () => {
  const prompt = pass2VerdictPrompt({
    incidentType: "handball",
    lawNumber: "Law 12",
    retrievedChunks: [],
    originalDecision: "no_penalty_awarded",
    reviewMode: "call_review",
  });
  assert.match(prompt, /REFERENCE EXAMPLES/);
  assert.match(prompt, /handball \(matching\)/);
  assert.match(prompt, /offside \(inconclusive anchor\)/);
});

test("pass2VerdictPrompt for offside doesn't duplicate the inconclusive anchor", () => {
  const prompt = pass2VerdictPrompt({
    incidentType: "offside",
    lawNumber: "Law 11",
    retrievedChunks: [],
    originalDecision: "goal_allowed",
    reviewMode: "call_review",
  });
  // The matching example IS the inconclusive anchor for offside; we should
  // not render the same JSON twice.
  const matches = prompt.match(/--- Example: /g) ?? [];
  assert.equal(matches.length, 1);
});

test("pass2VerdictPrompt for unsupported skips the few-shot block entirely", () => {
  const prompt = pass2VerdictPrompt({
    incidentType: "unsupported",
    lawNumber: "",
    retrievedChunks: [],
    originalDecision: "unknown",
    reviewMode: "rule_assessment",
  });
  assert.doesNotMatch(prompt, /REFERENCE EXAMPLES/);
});
