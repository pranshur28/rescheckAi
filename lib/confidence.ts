import type { Confidence, EvidenceQuality, ReviewMode, OriginalRefereeDecision } from "./types.ts";

// PRD §11.5: confidence is derived from evidence quality, NOT the model's self-rating.
// The model's `confidence` field is overwritten by this function before returning.
export function deriveConfidence(evidence: EvidenceQuality): Confidence {
  const missingCriticalContext = evidence.required_context_missing.length > 0;
  const visibilityGood =
    evidence.camera_angle === "clear" &&
    evidence.key_moment_visible &&
    evidence.frame_rate_adequate;

  const neededObjectsVisible =
    evidence.ball_visible_when_needed &&
    evidence.players_visible_when_needed &&
    evidence.field_lines_visible_when_needed;

  if (visibilityGood && neededObjectsVisible && !missingCriticalContext) {
    return "high";
  }

  if (
    evidence.camera_angle === "obstructed" ||
    !evidence.key_moment_visible ||
    missingCriticalContext
  ) {
    return "low";
  }

  return "medium";
}

// PRD §11.6: review mode is determined by whether the original decision was provided.
export function deriveReviewMode(originalDecision: OriginalRefereeDecision): ReviewMode {
  return originalDecision === "unknown" ? "rule_assessment" : "call_review";
}
