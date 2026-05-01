// Types mirror the JSON schemas in PRD v1.7 §11.

export type IncidentType =
  | "foul"
  | "handball"
  | "offside"
  | "penalty_kick"
  | "free_kick"
  | "throw_in"
  | "goal_kick"
  | "corner_kick"
  | "ball_in_out"
  | "unsupported"
  | "unknown";

export type OriginalRefereeDecision =
  | "foul_called"
  | "no_foul_called"
  | "penalty_awarded"
  | "no_penalty_awarded"
  | "offside_called"
  | "goal_allowed"
  | "goal_disallowed"
  | "throw_in_awarded"
  | "goal_kick_awarded"
  | "corner_kick_awarded"
  | "no_corner_kick_awarded"
  | "free_kick_awarded"
  | "yellow_card_given"
  | "red_card_given"
  | "unknown";

export type Verdict = "correct_call" | "bad_call" | "inconclusive";
export type Confidence = "low" | "medium" | "high";
export type ReviewMode = "call_review" | "rule_assessment";
export type RetrievalSource = "vertex" | "fallback" | "none";

export interface EvidenceQuality {
  camera_angle: "clear" | "partial" | "obstructed";
  key_moment_visible: boolean;
  ball_visible_when_needed: boolean;
  players_visible_when_needed: boolean;
  field_lines_visible_when_needed: boolean;
  frame_rate_adequate: boolean;
  required_context_missing: string[];
  issues: string[];
}

export interface RuleApplied {
  law_number: string;
  law_title: string;
  section: string;
  retrieved_chunk_ids: string[];
  quoted_rule: string;
}

export interface VerdictResponse {
  is_soccer_clip: boolean;
  detected_incident_type: IncidentType;
  original_referee_decision: OriginalRefereeDecision;
  review_mode: ReviewMode;
  verdict: Verdict;
  confidence: Confidence;
  key_moment_timestamp: string;
  what_happened: string;
  retrieval_source: RetrievalSource;
  rule_applied: RuleApplied | null;
  reasoning: string[];
  evidence_quality: EvidenceQuality;
  review_limitations: string[];
}

// PRD §6: deterministic incident-to-law mapping. Lives in code, not the prompt.
export const INCIDENT_TO_LAW: Record<IncidentType, string | null> = {
  foul: "Law 12",
  handball: "Law 12",
  offside: "Law 11",
  penalty_kick: "Law 14",
  free_kick: "Law 13",
  throw_in: "Law 15",
  goal_kick: "Law 16",
  corner_kick: "Law 17",
  ball_in_out: "Law 9",
  unsupported: null,
  unknown: null,
};

// PRD §9: per-incident FPS sampling for Pass 2.
export const PASS_2_FPS: Record<IncidentType, number> = {
  offside: 5,
  penalty_kick: 5,
  ball_in_out: 5,
  foul: 5,
  handball: 5,
  free_kick: 1,
  throw_in: 1,
  goal_kick: 1,
  corner_kick: 1,
  unsupported: 1,
  unknown: 1,
};
