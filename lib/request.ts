// Request body shape for POST /api/analyze.
// Manually validated (no zod dep — PRD calls for a lightweight scaffold).

import type { IncidentType, OriginalRefereeDecision } from "./types.ts";

const VALID_INCIDENT_TYPES: ReadonlyArray<IncidentType | "auto_detect"> = [
  "auto_detect",
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

const VALID_ORIGINAL_DECISIONS: ReadonlyArray<OriginalRefereeDecision> = [
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
];

export interface AnalyzeRequest {
  cloudinaryUrl: string;
  originalDecision: OriginalRefereeDecision;
  incidentType: IncidentType | "auto_detect";
  promptVersion?: string;
}

export type ParseResult =
  | { ok: true; value: AnalyzeRequest }
  | { ok: false; error: string };

export function parseAnalyzeRequest(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "request body must be an object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.cloudinaryUrl !== "string" || r.cloudinaryUrl.length === 0) {
    return { ok: false, error: "cloudinaryUrl is required and must be a non-empty string" };
  }
  // Lightweight URL sanity check; full validation happens at upload time.
  if (!/^https?:\/\//.test(r.cloudinaryUrl)) {
    return { ok: false, error: "cloudinaryUrl must be an http(s) URL" };
  }

  if (typeof r.originalDecision !== "string" ||
      !VALID_ORIGINAL_DECISIONS.includes(r.originalDecision as OriginalRefereeDecision)) {
    return { ok: false, error: `originalDecision must be one of: ${VALID_ORIGINAL_DECISIONS.join(", ")}` };
  }

  if (typeof r.incidentType !== "string" ||
      !VALID_INCIDENT_TYPES.includes(r.incidentType as IncidentType | "auto_detect")) {
    return { ok: false, error: `incidentType must be one of: ${VALID_INCIDENT_TYPES.join(", ")}` };
  }

  const promptVersion = typeof r.promptVersion === "string" ? r.promptVersion : undefined;

  return {
    ok: true,
    value: {
      cloudinaryUrl: r.cloudinaryUrl,
      originalDecision: r.originalDecision as OriginalRefereeDecision,
      incidentType: r.incidentType as IncidentType | "auto_detect",
      promptVersion,
    },
  };
}
