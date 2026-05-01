// Prompt strings live in code (PRD §11.8). They are iterated against the
// test set in PRD §12 — keep deltas small and version-tagged so eval results
// stay comparable.

import type { IncidentType, OriginalRefereeDecision } from "../types.ts";
import type { RetrievedChunk } from "../retrieval/types.ts";

export const PROMPT_VERSION = "p1.0.0";

// ---------------------------------------------------------------------------
// Pass 1 — classification. Tiny, no rule text, no schema baggage.
// ---------------------------------------------------------------------------
export function pass1ClassificationPrompt(): string {
  return [
    "You are reviewing a short soccer video clip.",
    "Decide if the clip appears to be soccer, identify the single most disputed incident, and classify it.",
    "",
    "Return ONLY a JSON object with this exact shape, no prose, no markdown fences:",
    "{",
    '  "is_soccer_clip": boolean,',
    '  "incident_type": "foul" | "handball" | "offside" | "penalty_kick" | "free_kick" | "throw_in" | "goal_kick" | "corner_kick" | "ball_in_out" | "unsupported" | "unknown",',
    '  "key_moment_timestamp": "MM:SS",',
    '  "search_terms": ["short", "phrases", "describing", "what", "matters"]',
    "}",
    "",
    "Rules:",
    "- If the clip is not soccer, set is_soccer_clip:false and incident_type:\"unknown\".",
    "- If the disputed incident is something we do not handle (e.g. weather, equipment, timing), set incident_type:\"unsupported\".",
    "- search_terms should be 3 to 8 short phrases that capture the rule angle (e.g. \"second-last defender\", \"deliberate handball\", \"goalkeeper off line\").",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pass 2 — verdict. Includes the retrieved chunks and the full output schema.
// ---------------------------------------------------------------------------
export interface Pass2PromptArgs {
  incidentType: IncidentType;
  lawNumber: string;
  retrievedChunks: RetrievedChunk[];
  originalDecision: OriginalRefereeDecision;
  reviewMode: "call_review" | "rule_assessment";
}

export function pass2VerdictPrompt(args: Pass2PromptArgs): string {
  const chunkBlock = args.retrievedChunks.length
    ? args.retrievedChunks
        .map(
          (c, i) =>
            `[chunk ${i + 1}, id="${c.id}", section="${c.section}"]\n${c.text}`,
        )
        .join("\n\n")
    : "(no chunks retrieved)";

  const schema = [
    "{",
    '  "is_soccer_clip": boolean,',
    '  "detected_incident_type": "foul" | "handball" | "offside" | "penalty_kick" | "free_kick" | "throw_in" | "goal_kick" | "corner_kick" | "ball_in_out" | "unsupported" | "unknown",',
    '  "original_referee_decision": same value passed in by the user,',
    '  "review_mode": "call_review" | "rule_assessment",',
    '  "verdict": "correct_call" | "bad_call" | "inconclusive",',
    '  "confidence": "low" | "medium" | "high",',
    '  "key_moment_timestamp": "MM:SS",',
    '  "what_happened": "One sentence describing the visible incident.",',
    '  "retrieval_source": leave as "vertex" — the server overwrites this,',
    '  "rule_applied": {',
    '    "law_number": string e.g. "Law 11",',
    '    "law_title": string,',
    '    "section": string,',
    '    "retrieved_chunk_ids": [chunk ids you actually used],',
    '    "quoted_rule": verbatim excerpt from one of the retrieved chunks (≥20 chars)',
    "  },",
    '  "reasoning": [5 short steps mapping evidence to rule and to the original decision],',
    '  "evidence_quality": {',
    '    "camera_angle": "clear" | "partial" | "obstructed",',
    '    "key_moment_visible": boolean,',
    '    "ball_visible_when_needed": boolean,',
    '    "players_visible_when_needed": boolean,',
    '    "field_lines_visible_when_needed": boolean,',
    '    "frame_rate_adequate": boolean,',
    '    "required_context_missing": [list any context you cannot see in the clip],',
    '    "issues": [list visibility issues]',
    "  },",
    '  "review_limitations": [list anything that limits certainty]',
    "}",
  ].join("\n");

  const reviewModeNotice =
    args.reviewMode === "rule_assessment"
      ? "REVIEW MODE: rule_assessment. The user did not provide the original referee decision. Return verdict:\"inconclusive\" and explain the likely rule application without saying the call was right or wrong."
      : `REVIEW MODE: call_review. The original referee decision was: "${args.originalDecision}". Compare your rule analysis against that decision.`;

  return [
    "You are RefCheck AI, a rule-grounded second-review assistant for soccer referee decisions.",
    "",
    `Incident type: ${args.incidentType}`,
    `Applicable law: ${args.lawNumber}`,
    "",
    "RETRIEVED RULE PASSAGES (cite only from these — do not paraphrase from memory):",
    "----- BEGIN PASSAGES -----",
    chunkBlock,
    "----- END PASSAGES -----",
    "",
    reviewModeNotice,
    "",
    "Output requirements:",
    "- Return ONLY a JSON object matching the schema below. No prose, no markdown fences.",
    "- quoted_rule must be a verbatim excerpt copied from one of the retrieved chunks above. Minimum 20 characters.",
    "- retrieved_chunk_ids must list the chunk ids (e.g. \"law-11-offside-position\") you actually used.",
    "- If the retrieved chunks do not address the visible incident, return verdict:\"inconclusive\".",
    "- Populate evidence_quality based ONLY on what is visible. Do not infer visibility from the original decision.",
    "- reasoning is exactly 5 short steps: (1) identify incident, (2) identify rule from chunks, (3) explain visible evidence, (4) compare evidence to rule, (5) compare rule analysis to original decision.",
    "",
    "Schema:",
    schema,
  ].join("\n");
}
