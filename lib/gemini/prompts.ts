// Prompt strings live in code (PRD §11.8). They are iterated against the
// test set in PRD §12 — keep deltas small and version-tagged so eval results
// stay comparable.

import type { IncidentType, OriginalRefereeDecision } from "../types.ts";
import type { RetrievedChunk } from "../retrieval/types.ts";

export const PROMPT_VERSION = "p1.1.0";

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



  const referenceExamples = `Reference examples (TEXT ONLY):
- Example (foul): Defender clips an attacker from behind during a challenge and the referee gives a direct free kick.
{"is_soccer_clip":true,"detected_incident_type":"foul","original_referee_decision":"direct_free_kick","review_mode":"call_review","verdict":"correct_call","confidence":"high","key_moment_timestamp":"00:12","what_happened":"A defender trips an attacker by clipping the ankle while challenging for the ball.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 12","law_title":"Fouls and Misconduct","section":"Direct free kick","retrieved_chunk_ids":["law-12-direct-free-kick-careless-reckless-excessive"],"quoted_rule":"A direct free kick is awarded if a player commits any of the following offences against an opponent in a manner considered by the referee to be careless, reckless or using excessive force"},"reasoning":["Incident is a trip with contact.","Law 12 direct free kick clause covers trips.","Contact at the ankle is visible.","This contact matches a careless/reckless challenge.","The original direct free kick decision matches the law."],"evidence_quality":{"camera_angle":"clear","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":false,"frame_rate_adequate":true,"required_context_missing":[],"issues":[]},"review_limitations":[]}

- Example (handball): A defender blocks a shot with an arm away from the body in the penalty area and a penalty is awarded.
{"is_soccer_clip":true,"detected_incident_type":"handball","original_referee_decision":"penalty","review_mode":"call_review","verdict":"correct_call","confidence":"high","key_moment_timestamp":"00:31","what_happened":"The defender's outstretched arm blocks the ball inside the penalty area.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 12","law_title":"Fouls and Misconduct","section":"Handling the ball","retrieved_chunk_ids":["law-12-handling-the-ball"],"quoted_rule":"It is an offence if a player: • deliberately touches the ball with their hand/arm, for example moving the hand/arm towards the ball • touches the ball with their hand/arm when it has made their body unnaturally bigger"},"reasoning":["Incident is potential handling by a defender.","Law 12 says handling that makes the body unnaturally bigger is an offence.","Arm position is away from the torso and blocks the shot.","This satisfies the handling offence criteria.","The original penalty decision is therefore correct."],"evidence_quality":{"camera_angle":"clear","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":true,"frame_rate_adequate":true,"required_context_missing":[],"issues":[]},"review_limitations":[]}

- Example (offside, inconclusive): A through ball is played but a defender blocks the camera view at the release moment and offside is flagged.
{"is_soccer_clip":true,"detected_incident_type":"offside","original_referee_decision":"offside","review_mode":"call_review","verdict":"inconclusive","confidence":"low","key_moment_timestamp":"00:44","what_happened":"An attacker runs onto a pass, but the pass contact frame and defensive line are obstructed.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 11","law_title":"Offside","section":"Offside position","retrieved_chunk_ids":["law-11-offside-position-definition"],"quoted_rule":"A player is in an offside position if: • any part of the head, body or feet is in the opponents’ half ( excluding the halfway line ) and • any part of the head, body or feet is nearer to the opponents’ goal line than both the ball and the second-last opponent"},"reasoning":["Incident is a possible offside at pass release.","Law 11 requires relative position to the ball and second-last opponent at that exact moment.","Camera obstruction hides the decisive frame.","The clip cannot establish offside position reliably.","The original offside decision cannot be confirmed or overturned, so inconclusive."],"evidence_quality":{"camera_angle":"obstructed","key_moment_visible":false,"ball_visible_when_needed":false,"players_visible_when_needed":false,"field_lines_visible_when_needed":false,"frame_rate_adequate":true,"required_context_missing":["exact ball-contact frame","full defensive line"],"issues":["defender blocks camera at release moment"]},"review_limitations":["offside line cannot be reliably established"]}

- Example (penalty_kick): Defender pulls an attacker to ground inside the box and a penalty is awarded.
{"is_soccer_clip":true,"detected_incident_type":"penalty_kick","original_referee_decision":"penalty","review_mode":"call_review","verdict":"correct_call","confidence":"high","key_moment_timestamp":"00:52","what_happened":"A defender holds and pulls an attacker down inside the penalty area.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 14","law_title":"The Penalty Kick","section":"The Penalty Kick","retrieved_chunk_ids":["law-14-penalty-kick-award"],"quoted_rule":"A penalty kick is awarded if a player commits a direct free kick offence inside their penalty area or off the field as part of play as outlined in Laws 12 and 13"},"reasoning":["Incident is contact foul inside the penalty area.","Law 14 states DFK offences in area result in a penalty kick.","Holding and pulling are visible before the fall.","That contact is a direct free kick offence by Law 12 references.","The original penalty decision matches the law."],"evidence_quality":{"camera_angle":"clear","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":true,"frame_rate_adequate":true,"required_context_missing":[],"issues":[]},"review_limitations":[]}

- Example (free_kick): An attacker takes a free kick while a defender is too close and blocks it; the kick is ordered retaken.
{"is_soccer_clip":true,"detected_incident_type":"free_kick","original_referee_decision":"retake","review_mode":"call_review","verdict":"correct_call","confidence":"medium","key_moment_timestamp":"01:08","what_happened":"A defender stands within the minimum distance and blocks a formally taken free kick.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 13","law_title":"Free Kicks","section":"Offences and sanctions","retrieved_chunk_ids":["law-13-offences-and-sanctions"],"quoted_rule":"If, when a free kick is taken, an opponent is closer to the ball than the required distance, the kick is retaken unless the advantage can be applied"},"reasoning":["Incident concerns restart distance at a free kick.","Law 13 requires opponents to respect minimum distance or retake applies.","Defender is visibly too close at the kick.","The close position directly impacts by blocking the ball.","Retake decision is consistent with the law."],"evidence_quality":{"camera_angle":"partial","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":false,"frame_rate_adequate":true,"required_context_missing":[],"issues":["distance estimate not perfectly calibrated"]},"review_limitations":["exact meter distance is estimated from broadcast angle"]}

- Example (throw_in): Ball crosses touchline last off defender, but throw-in is awarded to defender's team.
{"is_soccer_clip":true,"detected_incident_type":"throw_in","original_referee_decision":"throw_in_defending_team","review_mode":"call_review","verdict":"bad_call","confidence":"medium","key_moment_timestamp":"00:19","what_happened":"The ball fully crosses the touchline after touching a defender last, then throw-in is awarded to that same team.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 15","law_title":"The Throw-in","section":"The Throw-in","retrieved_chunk_ids":["law-15-throw-in-award"],"quoted_rule":"A throw-in is awarded to the opponents of the player who last touched the ball when the whole of the ball passes over the touchline, on the ground or in the air"},"reasoning":["Incident is throw-in direction after ball exits over touchline.","Law 15 awards throw-in to opponents of the last toucher.","Replay shows final touch by defender.","Therefore restart should go to attacking opponents.","Original decision giving it to defender's team is a bad call."],"evidence_quality":{"camera_angle":"partial","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":true,"frame_rate_adequate":true,"required_context_missing":[],"issues":["last touch requires close replay"]},"review_limitations":[]}

- Example (goal_kick): Shot goes over goal line untouched by defenders, but a corner is awarded.
{"is_soccer_clip":true,"detected_incident_type":"goal_kick","original_referee_decision":"corner_kick","review_mode":"call_review","verdict":"bad_call","confidence":"medium","key_moment_timestamp":"00:27","what_happened":"An attacker shoots wide over the goal line with no visible defensive touch, but a corner is given.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 16","law_title":"The Goal Kick","section":"The Goal Kick","retrieved_chunk_ids":["law-16-goal-kick-award"],"quoted_rule":"A goal kick is awarded when the whole of the ball passes over the goal line, on the ground or in the air, having last touched a player of the attacking team, and a goal is not scored"},"reasoning":["Incident is whether restart should be goal kick or corner.","Law 16 gives goal kick if attackers touched last and no goal scored.","No defender touch is visible before ball crosses line.","That means restart should be a goal kick.","Original corner decision is inconsistent with the law."],"evidence_quality":{"camera_angle":"partial","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":true,"frame_rate_adequate":true,"required_context_missing":[],"issues":["possible faint touch cannot be fully ruled out"]},"review_limitations":["fine deflection may be hard to detect at this frame rate"]}

- Example (corner_kick): Defender blocks cross and ball goes over goal line; corner is awarded.
{"is_soccer_clip":true,"detected_incident_type":"corner_kick","original_referee_decision":"corner_kick","review_mode":"call_review","verdict":"correct_call","confidence":"high","key_moment_timestamp":"01:02","what_happened":"A defender makes the final touch before the ball crosses the goal line outside the goal.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 17","law_title":"The Corner Kick","section":"The Corner Kick","retrieved_chunk_ids":["law-17-corner-kick-award"],"quoted_rule":"A corner kick is awarded when the whole of the ball passes over the goal line, on the ground or in the air, having last touched a player of the defending team, and a goal is not scored"},"reasoning":["Incident is restart after ball exits over goal line.","Law 17 awards corner when defender touched last and no goal scored.","Defender touch is visible right before exit.","This matches the law's trigger for a corner kick.","Original corner decision is correct."],"evidence_quality":{"camera_angle":"clear","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":true,"field_lines_visible_when_needed":true,"frame_rate_adequate":true,"required_context_missing":[],"issues":[]},"review_limitations":[]}

- Example (ball_in_out): Ball appears near touchline but never fully crosses; play is correctly allowed to continue.
{"is_soccer_clip":true,"detected_incident_type":"ball_in_out","original_referee_decision":"play_on","review_mode":"call_review","verdict":"correct_call","confidence":"medium","key_moment_timestamp":"00:36","what_happened":"The ball bounces on or over the touchline paint but remains partially over the field, and play continues.","retrieval_source":"vertex","rule_applied":{"law_number":"Law 9","law_title":"The Ball in and out of Play","section":"Ball out of play","retrieved_chunk_ids":["law-09-ball-out-of-play-boundary"],"quoted_rule":"it has wholly passed over the goal line or touchline on the ground or in the air"},"reasoning":["Incident is whether ball is out at the touchline.","Law 9 requires the whole ball to pass over the line to be out.","Video shows part of the ball still overlapping the line plane.","So ball remains in play under the rule.","Original play-on decision is correct."],"evidence_quality":{"camera_angle":"partial","key_moment_visible":true,"ball_visible_when_needed":true,"players_visible_when_needed":false,"field_lines_visible_when_needed":true,"frame_rate_adequate":true,"required_context_missing":[],"issues":["parallax from sideline camera"]},"review_limitations":["no goal-line camera for exact vertical plane"]}`;

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
    referenceExamples,
    "",
    "Schema:",
    schema,
  ].join("\n");
}
