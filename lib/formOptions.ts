// Form option lists for the input UI. Mirror the enums in lib/types.ts and
// lib/request.ts so the dropdowns offer exactly the values the API accepts.

import type { IncidentType, OriginalRefereeDecision } from "./types.ts";

export const ORIGINAL_DECISION_OPTIONS: Array<{
  value: OriginalRefereeDecision;
  label: string;
}> = [
  { value: "foul_called", label: "Foul called" },
  { value: "no_foul_called", label: "No foul called" },
  { value: "penalty_awarded", label: "Penalty awarded" },
  { value: "no_penalty_awarded", label: "No penalty awarded" },
  { value: "offside_called", label: "Offside called" },
  { value: "goal_allowed", label: "Goal allowed" },
  { value: "goal_disallowed", label: "Goal disallowed" },
  { value: "throw_in_awarded", label: "Throw-in awarded" },
  { value: "goal_kick_awarded", label: "Goal kick awarded" },
  { value: "corner_kick_awarded", label: "Corner kick awarded" },
  { value: "free_kick_awarded", label: "Free kick awarded" },
  { value: "yellow_card_given", label: "Yellow card given" },
  { value: "red_card_given", label: "Red card given" },
  { value: "unknown", label: "Unknown" },
];

export const INCIDENT_TYPE_OPTIONS: Array<{
  value: IncidentType | "auto_detect";
  label: string;
}> = [
  { value: "auto_detect", label: "Auto-detect (recommended)" },
  { value: "foul", label: "Foul or misconduct" },
  { value: "handball", label: "Handball" },
  { value: "offside", label: "Offside" },
  { value: "penalty_kick", label: "Penalty kick" },
  { value: "free_kick", label: "Free kick" },
  { value: "throw_in", label: "Throw-in" },
  { value: "goal_kick", label: "Goal kick" },
  { value: "corner_kick", label: "Corner kick" },
  { value: "ball_in_out", label: "Ball in / out of play" },
];
