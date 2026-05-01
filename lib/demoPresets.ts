// PRD §13 — three demo preset buttons. Each preset pre-fills original
// decision + incident type and points at a Cloudinary clip already uploaded
// to our cloud. URLs are placeholders until the team uploads real demo clips
// (PRD §16 Hour 8). The `cloudinaryUrl` field uses res.cloudinary.com so the
// SSRF guard in lib/request.ts accepts it.

import type { IncidentType, OriginalRefereeDecision } from "./types.ts";

export interface DemoPreset {
  id: string;
  label: string;
  presenterNote: string;
  cloudinaryUrl: string;
  originalDecision: OriginalRefereeDecision;
  incidentType: IncidentType | "auto_detect";
  expectedLaw: string;
  expectedVerdict: "correct_call" | "bad_call" | "inconclusive";
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "foul-penalty",
    label: "Foul / penalty",
    presenterNote:
      "Defender trips attacker inside the penalty area. Referee awarded a penalty.",
    cloudinaryUrl:
      "https://res.cloudinary.com/REPLACE_ME/video/upload/v1/refcheck-demo/foul-penalty.mp4",
    originalDecision: "penalty_awarded",
    incidentType: "foul",
    expectedLaw: "Law 12",
    expectedVerdict: "correct_call",
  },
  {
    id: "offside-goal",
    label: "Offside",
    presenterNote:
      "Striker is past the second-last defender at the moment the ball is played.",
    cloudinaryUrl:
      "https://res.cloudinary.com/REPLACE_ME/video/upload/v1/refcheck-demo/offside-goal.mp4",
    originalDecision: "goal_allowed",
    incidentType: "offside",
    expectedLaw: "Law 11",
    expectedVerdict: "bad_call",
  },
  {
    id: "obstructed-inconclusive",
    label: "Inconclusive",
    presenterNote:
      "Camera angle is obstructed at the moment of contact — evidence isn't sufficient.",
    cloudinaryUrl:
      "https://res.cloudinary.com/REPLACE_ME/video/upload/v1/refcheck-demo/obstructed.mp4",
    originalDecision: "no_foul_called",
    incidentType: "auto_detect",
    expectedLaw: "Law 12",
    expectedVerdict: "inconclusive",
  },
];
