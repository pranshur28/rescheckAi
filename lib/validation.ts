// PRD §11.7 response validation pipeline.
// Pure functions — no AI calls, no I/O. Easy to unit-test.

import { deriveConfidence, deriveReviewMode } from "./confidence.ts";
import type {
  Confidence,
  OriginalRefereeDecision,
  RetrievalSource,
  Verdict,
  VerdictResponse,
} from "./types.ts";
import type { RetrievedChunk } from "./retrieval/types.ts";

export interface ValidationContext {
  retrievalSource: RetrievalSource;
  retrievedChunks: RetrievedChunk[];
  originalDecision: OriginalRefereeDecision;
}

export interface ValidationOutcome {
  response: VerdictResponse;
  // Notes the validator flagged. Useful for the eval script and debug surfacing.
  flags: string[];
}

// Step 1 of §11.7: parse model output, retry once with a stricter repair prompt
// if needed. The repair prompt itself lives in lib/gemini/prompts.ts; this helper
// only does the parse and signals whether a repair retry is warranted.
export function tryParseModelJson(raw: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  // Models sometimes wrap JSON in ```json fences. Strip them defensively.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

// Step 4 of §11.7: every retrieved_chunk_id must appear in the retrieval set.
// If any id is invented, downgrade confidence to low and flag the response.
export function validateChunkIds(
  responseIds: string[] | undefined,
  retrievedChunks: RetrievedChunk[],
): { allKnown: boolean; unknownIds: string[] } {
  if (!responseIds || responseIds.length === 0) {
    return { allKnown: true, unknownIds: [] };
  }
  const known = new Set(retrievedChunks.map((c) => c.id));
  const unknownIds = responseIds.filter((id) => !known.has(id));
  return { allKnown: unknownIds.length === 0, unknownIds };
}

// Step 5 of §11.7: quoted_rule must appear verbatim (or as a clear substring)
// within at least one retrieved chunk. The normalizer handles:
//   - whitespace re-flow (model often joins or splits lines)
//   - Unicode NFKC compatibility (ligatures like ﬁ → fi, half-width forms)
//   - smart quotes ("/"/'/' → "/'), em/en dashes (–/— → -)
//   - soft hyphens (U+00AD) which PDF extraction often leaves embedded
// Without these normalizations, valid IFAB quotes routed through the PDF →
// embedding → model copy path get false-flagged as fabricated.
export function normalizeForQuoteMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/­/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quotedRuleAppearsInChunks(quoted: string, chunks: RetrievedChunk[]): boolean {
  if (!quoted) return false;
  const needle = normalizeForQuoteMatch(quoted);
  if (needle.length < 20) {
    // Anything shorter than 20 normalized chars is too low-signal to count as
    // a verbatim citation — could match coincidentally.
    return false;
  }
  return chunks.some((c) => normalizeForQuoteMatch(c.text).includes(needle));
}

// Main validation entry point. Takes the parsed model JSON + the call's
// retrieval context, and returns a final VerdictResponse plus any flags.
//
// Mutations performed (in order):
//   1. retrieval_source overwritten to context.retrievalSource (model may not
//      know which path fired).
//   2. confidence overwritten via deriveConfidence (PRD §11.5).
//   3. review_mode overwritten via deriveReviewMode (PRD §11.6).
//   4. If original_referee_decision === "unknown" but verdict in {correct,bad},
//      override verdict to "inconclusive" and set review_mode to "rule_assessment"
//      (PRD §11.7 step 6 / §17 Q&A "What if the original call is unknown?").
//   5. If validateChunkIds reports unknown ids OR quotedRuleAppearsInChunks is
//      false, downgrade confidence to "low" and add flags.
export function applyValidation(
  parsed: VerdictResponse,
  ctx: ValidationContext,
): ValidationOutcome {
  const flags: string[] = [];

  // Start from a shallow copy so we don't mutate the caller's object.
  const r: VerdictResponse = { ...parsed };

  // (1) retrieval_source is set authoritatively by the analyze function.
  r.retrieval_source = ctx.retrievalSource;

  // (2) original_referee_decision should match what we sent in. Trust ctx.
  r.original_referee_decision = ctx.originalDecision;

  // (3) review_mode derivation.
  r.review_mode = deriveReviewMode(ctx.originalDecision);

  // (4) Unknown-decision override.
  if (ctx.originalDecision === "unknown" && r.verdict !== "inconclusive") {
    flags.push(`override:unknown-decision-forced-inconclusive (was ${r.verdict})`);
    r.verdict = "inconclusive";
    r.review_mode = "rule_assessment";
  }

  // (5) Citation grounding checks. Only meaningful when we actually retrieved
  // chunks (i.e. retrieval_source !== "none"). When retrieval_source is "none",
  // rule_applied should be null — enforce that here too.
  let confidenceDowngrade = false;

  if (ctx.retrievalSource === "none") {
    if (r.rule_applied !== null) {
      flags.push("override:rule_applied-must-be-null-when-retrieval-source-is-none");
      r.rule_applied = null;
    }
  } else if (r.rule_applied !== null) {
    const idCheck = validateChunkIds(r.rule_applied.retrieved_chunk_ids, ctx.retrievedChunks);
    if (!idCheck.allKnown) {
      flags.push(`hallucinated-chunk-ids:${idCheck.unknownIds.join(",")}`);
      confidenceDowngrade = true;
    }
    if (!quotedRuleAppearsInChunks(r.rule_applied.quoted_rule, ctx.retrievedChunks)) {
      flags.push("quoted-rule-not-in-retrieved-chunks");
      confidenceDowngrade = true;
    }
  }

  // (6) Confidence: derive from evidence_quality, then optionally downgrade.
  const derived: Confidence = deriveConfidence(r.evidence_quality);
  r.confidence = confidenceDowngrade ? "low" : derived;
  if (confidenceDowngrade && derived !== "low") {
    flags.push(`confidence-downgraded:${derived}->low`);
  }

  return { response: r, flags };
}

// Sentinels for callers that need to distinguish failure types.
export type AnalyzeFailureKind = "unparseable" | "schema-mismatch";

export interface AnalyzeFailure {
  kind: AnalyzeFailureKind;
  detail: string;
  raw: string;
}

// Light schema check — does the parsed JSON have the top-level fields we need?
// Full Zod-style validation is overkill; we just need to know whether the
// model returned something close enough to apply business rules to.
export function looksLikeVerdictResponse(value: unknown): value is VerdictResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.is_soccer_clip === "boolean" &&
    typeof v.detected_incident_type === "string" &&
    typeof v.verdict === "string" &&
    typeof v.what_happened === "string" &&
    typeof v.evidence_quality === "object" &&
    Array.isArray(v.reasoning) &&
    (v.rule_applied === null || typeof v.rule_applied === "object")
  );
}

// Convenience: the inconclusive shape used for short-circuit paths
// (is_soccer_clip:false, incident_type:unsupported, etc.) per PRD §11.4.
export function shortCircuitInconclusive(opts: {
  isSoccerClip: boolean;
  detectedIncidentType: VerdictResponse["detected_incident_type"];
  originalDecision: OriginalRefereeDecision;
  reason: string;
  keyMomentTimestamp?: string;
}): VerdictResponse {
  return {
    is_soccer_clip: opts.isSoccerClip,
    detected_incident_type: opts.detectedIncidentType,
    original_referee_decision: opts.originalDecision,
    review_mode: deriveReviewMode(opts.originalDecision),
    verdict: "inconclusive" satisfies Verdict,
    confidence: "low",
    key_moment_timestamp: opts.keyMomentTimestamp ?? "00:00",
    what_happened: opts.reason,
    retrieval_source: "none",
    rule_applied: null,
    reasoning: [opts.reason],
    evidence_quality: {
      camera_angle: "obstructed",
      key_moment_visible: false,
      ball_visible_when_needed: false,
      players_visible_when_needed: false,
      field_lines_visible_when_needed: false,
      frame_rate_adequate: false,
      required_context_missing: [],
      issues: [opts.reason],
    },
    review_limitations: [opts.reason],
  };
}
