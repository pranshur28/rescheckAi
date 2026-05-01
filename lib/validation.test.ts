// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tryParseModelJson,
  validateChunkIds,
  quotedRuleAppearsInChunks,
  normalizeForQuoteMatch,
  applyValidation,
  looksLikeVerdictResponse,
  shortCircuitInconclusive,
} from "./validation.ts";
import type { RetrievedChunk } from "./retrieval/types.ts";
import type { VerdictResponse } from "./types.ts";

const sampleChunks: RetrievedChunk[] = [
  {
    id: "law-11-offside-offence",
    law_number: "Law 11",
    law_title: "Offside",
    section: "Offside offence",
    text: "A player in an offside position at the moment the ball is played by a teammate is only penalised on becoming involved in active play by interfering with play, interfering with an opponent, or gaining an advantage by being in that position.",
  },
  {
    id: "law-11-offside-position",
    law_number: "Law 11",
    law_title: "Offside",
    section: "Offside position",
    text: "A player is in an offside position if any part of the head, body or feet is in the opponents' half (excluding the halfway line) and any part of the head, body or feet is nearer to the opponents' goal line than both the ball and the second-last opponent.",
  },
];

test("tryParseModelJson parses plain JSON", () => {
  const r = tryParseModelJson('{"a":1}');
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { a: 1 });
});

test("tryParseModelJson strips markdown fences", () => {
  const r = tryParseModelJson('```json\n{"a":1}\n```');
  assert.equal(r.ok, true);
});

test("tryParseModelJson returns reason on bad JSON", () => {
  const r = tryParseModelJson("not json");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /JSON|token/i);
});

test("validateChunkIds passes when all ids are known", () => {
  const r = validateChunkIds(["law-11-offside-offence"], sampleChunks);
  assert.equal(r.allKnown, true);
  assert.deepEqual(r.unknownIds, []);
});

test("validateChunkIds flags hallucinated ids", () => {
  const r = validateChunkIds(["law-11-offside-offence", "made-up-id"], sampleChunks);
  assert.equal(r.allKnown, false);
  assert.deepEqual(r.unknownIds, ["made-up-id"]);
});

test("validateChunkIds tolerates empty array (no citation)", () => {
  const r = validateChunkIds([], sampleChunks);
  assert.equal(r.allKnown, true);
});

test("quotedRuleAppearsInChunks finds verbatim long quote", () => {
  const found = quotedRuleAppearsInChunks(
    "is only penalised on becoming involved in active play by interfering with play",
    sampleChunks,
  );
  assert.equal(found, true);
});

test("quotedRuleAppearsInChunks normalizes whitespace", () => {
  const found = quotedRuleAppearsInChunks(
    "is only penalised   on   becoming\ninvolved in active play",
    sampleChunks,
  );
  assert.equal(found, true);
});

test("quotedRuleAppearsInChunks rejects too-short quotes", () => {
  // Under 20 chars is too low-signal; even if it matches, return false.
  const found = quotedRuleAppearsInChunks("the ball", sampleChunks);
  assert.equal(found, false);
});

test("quotedRuleAppearsInChunks rejects fabricated long quotes", () => {
  const found = quotedRuleAppearsInChunks(
    "the goalkeeper must remain perfectly still during the kick",
    sampleChunks,
  );
  assert.equal(found, false);
});

test("normalizeForQuoteMatch handles smart quotes and em-dashes", () => {
  const a = normalizeForQuoteMatch("“interfering” — active play");
  const b = normalizeForQuoteMatch("\"interfering\" - active play");
  assert.equal(a, b);
});

test("normalizeForQuoteMatch strips soft hyphens (PDF artifact)", () => {
  const norm = normalizeForQuoteMatch("inter­fering with play");
  assert.equal(norm, "interfering with play");
});

test("normalizeForQuoteMatch NFKC-normalizes ligatures", () => {
  // The "ﬁ" (U+FB01) ligature should normalize to "fi"
  const norm = normalizeForQuoteMatch("ﬁnal pass");
  assert.equal(norm, "final pass");
});

test("quotedRuleAppearsInChunks tolerates smart-quote rewrites", () => {
  const chunksWithSmartQuote: RetrievedChunk[] = [
    {
      id: "x",
      law_number: "Law 12",
      law_title: "Fouls",
      section: "Misconduct",
      text: "The referee may caution a player who shows “dissent by word or action” toward an official.",
    },
  ];
  const found = quotedRuleAppearsInChunks(
    'shows "dissent by word or action" toward an official',
    chunksWithSmartQuote,
  );
  assert.equal(found, true);
});

function baseGoodResponse(): VerdictResponse {
  return {
    is_soccer_clip: true,
    detected_incident_type: "offside",
    original_referee_decision: "offside_called",
    review_mode: "call_review",
    verdict: "correct_call",
    confidence: "high", // model self-rating; will be overwritten
    key_moment_timestamp: "00:04",
    what_happened: "Striker is past the second-last defender at the moment the ball is played.",
    retrieval_source: "vertex",
    rule_applied: {
      law_number: "Law 11",
      law_title: "Offside",
      section: "Offside position",
      retrieved_chunk_ids: ["law-11-offside-position"],
      quoted_rule: "any part of the head, body or feet is nearer to the opponents' goal line than both the ball and the second-last opponent",
    },
    reasoning: ["s1", "s2", "s3"],
    evidence_quality: {
      camera_angle: "clear",
      key_moment_visible: true,
      ball_visible_when_needed: true,
      players_visible_when_needed: true,
      field_lines_visible_when_needed: true,
      frame_rate_adequate: true,
      required_context_missing: [],
      issues: [],
    },
    review_limitations: [],
  };
}

test("applyValidation: clean response derives high confidence", () => {
  const res = applyValidation(baseGoodResponse(), {
    retrievalSource: "vertex",
    retrievedChunks: sampleChunks,
    originalDecision: "offside_called",
  });
  assert.equal(res.response.confidence, "high");
  assert.deepEqual(res.flags, []);
});

test("applyValidation: hallucinated chunk id downgrades confidence", () => {
  const r = baseGoodResponse();
  r.rule_applied!.retrieved_chunk_ids = ["fake-id"];
  const res = applyValidation(r, {
    retrievalSource: "vertex",
    retrievedChunks: sampleChunks,
    originalDecision: "offside_called",
  });
  assert.equal(res.response.confidence, "low");
  assert.ok(res.flags.some((f) => f.startsWith("hallucinated-chunk-ids:fake-id")));
});

test("applyValidation: fabricated quoted_rule downgrades confidence", () => {
  const r = baseGoodResponse();
  r.rule_applied!.quoted_rule = "the goalkeeper must remain perfectly still during the kick";
  const res = applyValidation(r, {
    retrievalSource: "vertex",
    retrievedChunks: sampleChunks,
    originalDecision: "offside_called",
  });
  assert.equal(res.response.confidence, "low");
  assert.ok(res.flags.includes("quoted-rule-not-in-retrieved-chunks"));
});

test("applyValidation: unknown decision forces inconclusive", () => {
  const r = baseGoodResponse();
  const res = applyValidation(r, {
    retrievalSource: "vertex",
    retrievedChunks: sampleChunks,
    originalDecision: "unknown",
  });
  assert.equal(res.response.verdict, "inconclusive");
  assert.equal(res.response.review_mode, "rule_assessment");
  assert.ok(res.flags.some((f) => f.startsWith("override:unknown-decision-forced-inconclusive")));
});

test("applyValidation: retrieval_source=none enforces rule_applied=null", () => {
  const r = baseGoodResponse();
  const res = applyValidation(r, {
    retrievalSource: "none",
    retrievedChunks: [],
    originalDecision: "offside_called",
  });
  assert.equal(res.response.rule_applied, null);
  assert.ok(res.flags.includes("override:rule_applied-must-be-null-when-retrieval-source-is-none"));
});

test("applyValidation: retrieval_source authoritatively set from context", () => {
  const r = baseGoodResponse();
  r.retrieval_source = "vertex"; // model claimed vertex
  const res = applyValidation(r, {
    retrievalSource: "fallback", // but the function knows fallback fired
    retrievedChunks: sampleChunks,
    originalDecision: "offside_called",
  });
  assert.equal(res.response.retrieval_source, "fallback");
});

test("looksLikeVerdictResponse accepts valid shape", () => {
  assert.equal(looksLikeVerdictResponse(baseGoodResponse()), true);
});

test("looksLikeVerdictResponse rejects missing fields", () => {
  assert.equal(looksLikeVerdictResponse({ is_soccer_clip: true }), false);
  assert.equal(looksLikeVerdictResponse(null), false);
  assert.equal(looksLikeVerdictResponse("string"), false);
});

test("shortCircuitInconclusive sets retrieval_source to none and rule_applied to null", () => {
  const r = shortCircuitInconclusive({
    isSoccerClip: false,
    detectedIncidentType: "unknown",
    originalDecision: "penalty_awarded",
    reason: "Clip does not appear to be soccer.",
  });
  assert.equal(r.retrieval_source, "none");
  assert.equal(r.rule_applied, null);
  assert.equal(r.verdict, "inconclusive");
  assert.equal(r.is_soccer_clip, false);
});
