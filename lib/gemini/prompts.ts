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
// Pass 2 — verdict. Includes the retrieved chunks, few-shot examples for the
// matching incident type plus a calibration inconclusive, and the full output
// schema.
// ---------------------------------------------------------------------------
export interface Pass2PromptArgs {
  incidentType: IncidentType;
  lawNumber: string;
  retrievedChunks: RetrievedChunk[];
  originalDecision: OriginalRefereeDecision;
  reviewMode: "call_review" | "rule_assessment";
}

// PRD §11.8 — per-incident reference examples. The model gets one example
// matching the current incident type plus the offside-inconclusive example as
// a calibration anchor for low-confidence cases. Including all 8 in every
// prompt would 8x the few-shot token cost without 8x the accuracy lift, so we
// keep all 8 defined here for documentation/eval reuse and pick the relevant
// subset at prompt build time.
//
// Every quoted_rule is a verbatim substring of a chunk in
// data/ifab-rules-fallback.json. Every retrieved_chunk_ids entry is a real id
// from that file. The validation pipeline (lib/validation.ts) treats this as
// the bar for any model output, so the few-shots have to clear it themselves.
interface FewShotExample {
  incident: string;
  output: Record<string, unknown>;
}

export const PASS_2_FEW_SHOTS: Record<IncidentType, FewShotExample | null> = {
  foul: {
    incident:
      "Defender extends a leg into the path of an attacker inside the penalty area, making leg-to-leg contact before the ball; referee awarded a penalty.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "foul",
      original_referee_decision: "penalty_awarded",
      review_mode: "call_review",
      verdict: "correct_call",
      confidence: "high",
      key_moment_timestamp: "0:04",
      what_happened:
        "A defender's leading foot makes contact with the attacker's planted leg before any contact with the ball, inside the penalty area.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 12",
        law_title: "Fouls and Misconduct",
        section: "Direct free kick",
        retrieved_chunk_ids: [
          "law-12-direct-free-kick-careless-reckless-excessive",
        ],
        quoted_rule:
          "A direct free kick is awarded if a player commits any of the following offences against an opponent in a manner considered by the referee to be careless, reckless or using excessive force",
      },
      reasoning: [
        "Identify incident: a defender's tackle on an attacker inside the penalty area.",
        "Identify rule: Law 12 lists trips and challenges that are careless, reckless, or use excessive force as direct-free-kick offences.",
        "Visible evidence: the defender's foot contacts the attacker's planted leg before any contact with the ball.",
        "Compare to rule: the contact meets the careless threshold; inside the penalty area this becomes a penalty.",
        "Compare to original decision: penalty awarded matches what the rule prescribes.",
      ],
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
    },
  },
  handball: {
    incident:
      "Defender's outstretched arm blocks a goal-bound shot; arm is clearly extended away from the body. No penalty was given.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "handball",
      original_referee_decision: "no_penalty_awarded",
      review_mode: "call_review",
      verdict: "bad_call",
      confidence: "high",
      key_moment_timestamp: "0:05",
      what_happened:
        "A defender extends an arm away from the body and blocks a goal-bound shot inside the penalty area.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 12",
        law_title: "Fouls and Misconduct",
        section: "Handling the ball",
        retrieved_chunk_ids: ["law-12-handling-the-ball"],
        quoted_rule:
          "touches the ball with their hand/arm when it has made their body unnaturally bigger",
      },
      reasoning: [
        "Identify incident: a defender's arm contacts a goal-bound shot inside the penalty area.",
        "Identify rule: Law 12 makes contact with hand/arm an offence when the arm has made the body unnaturally bigger.",
        "Visible evidence: the defender's arm is extended outside the silhouette of the body when the ball strikes it.",
        "Compare to rule: the body-unnaturally-bigger criterion is met, so this is a handball offence; inside the box, a penalty.",
        "Compare to original decision: no penalty awarded does not match what the rule prescribes; the call was missed.",
      ],
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
    },
  },
  offside: {
    incident:
      "Attacker times a run onto a through ball; camera is panning and a player crosses the foreground at the moment the pass is played.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "offside",
      original_referee_decision: "goal_allowed",
      review_mode: "call_review",
      verdict: "inconclusive",
      confidence: "low",
      key_moment_timestamp: "0:03",
      what_happened:
        "An attacker meets a through ball and finishes; at the moment the pass is played, a foreground player obscures the offside line.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 11",
        law_title: "Offside",
        section: "Offside position",
        retrieved_chunk_ids: ["law-11-offside-position-definition"],
        quoted_rule:
          "A player is in an offside position if: • any part of the head, body or feet is in the opponents' half",
      },
      reasoning: [
        "Identify incident: an attacker receives a through ball and scores.",
        "Identify rule: Law 11 places a player in an offside position relative to the second-last opponent at the moment the ball is played by a team-mate.",
        "Visible evidence: the camera is panning and a foreground player blocks the offside line at the exact frame of the pass.",
        "Compare to rule: without seeing the relative positions at the decisive frame, the rule cannot be applied with confidence.",
        "Compare to original decision: goal allowed cannot be evaluated against the rule because the determining frame is obscured.",
      ],
      evidence_quality: {
        camera_angle: "obstructed",
        key_moment_visible: false,
        ball_visible_when_needed: true,
        players_visible_when_needed: false,
        field_lines_visible_when_needed: false,
        frame_rate_adequate: true,
        required_context_missing: [
          "Position of the second-last defender at the moment the ball is played",
        ],
        issues: [
          "Foreground player crosses the camera line at the moment of the pass.",
        ],
      },
      review_limitations: [
        "A second camera angle or VAR offside line would likely resolve this; the live single angle is insufficient.",
      ],
    },
  },
  penalty_kick: {
    incident:
      "Goalkeeper steps off the goal line before the ball is kicked and saves the penalty; referee orders a retake.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "penalty_kick",
      original_referee_decision: "no_penalty_awarded",
      review_mode: "call_review",
      verdict: "correct_call",
      confidence: "high",
      key_moment_timestamp: "0:06",
      what_happened:
        "The goalkeeper has both feet clearly off the goal line at the moment the ball is kicked, then saves the penalty.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 14",
        law_title: "The Penalty Kick",
        section: "Procedure",
        retrieved_chunk_ids: ["law-14-procedure-kick-completion"],
        quoted_rule:
          "When the ball is kicked, the defending goalkeeper must have at least part of one foot touching, in line with, or behind, the goal line.",
      },
      reasoning: [
        "Identify incident: a saved penalty kick where the goalkeeper moved before the ball was kicked.",
        "Identify rule: Law 14 requires the goalkeeper to keep at least part of one foot touching, in line with, or behind, the goal line until the ball is kicked.",
        "Visible evidence: at the frame the kicker contacts the ball, both of the goalkeeper's feet are clearly forward of the goal line.",
        "Compare to rule: the goalkeeper's encroachment is an offence; if the kick is missed or saved, the kick is retaken.",
        "Compare to original decision: ordering a retake matches what the rule prescribes.",
      ],
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
    },
  },
  free_kick: {
    incident:
      "Defending wall is clearly less than 9.15 m from the ball; referee allows the kick to proceed without resetting the wall.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "free_kick",
      original_referee_decision: "free_kick_awarded",
      review_mode: "call_review",
      verdict: "bad_call",
      confidence: "medium",
      key_moment_timestamp: "0:08",
      what_happened:
        "Three defenders form a wall an estimated 6-7 m from the ball; the kick is taken without the referee resetting the distance.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 13",
        law_title: "Free Kicks",
        section: "Procedure",
        retrieved_chunk_ids: ["law-13-procedure-ball-and-opponents"],
        quoted_rule:
          "Until the ball is in play, all opponents must remain: • at least 9.15 m (10 yds) from the ball",
      },
      reasoning: [
        "Identify incident: a free kick taken with the defensive wall too close to the ball.",
        "Identify rule: Law 13 requires opponents to remain at least 9.15 m from the ball until it is in play.",
        "Visible evidence: the wall stands roughly 6-7 m away, judged against the visible 18-yard markings.",
        "Compare to rule: the encroachment is clear; without advantage being applied, the kick should be retaken.",
        "Compare to original decision: allowing play to continue does not match what the rule prescribes for non-quick free kicks.",
      ],
      evidence_quality: {
        camera_angle: "partial",
        key_moment_visible: true,
        ball_visible_when_needed: true,
        players_visible_when_needed: true,
        field_lines_visible_when_needed: true,
        frame_rate_adequate: true,
        required_context_missing: [],
        issues: [
          "Distance is estimated from field markings rather than measured.",
        ],
      },
      review_limitations: [
        "Without a top-down angle, distance estimation has uncertainty in the 1-2 m range.",
      ],
    },
  },
  throw_in: {
    incident:
      "Thrower lifts both feet entirely off the ground at release; referee awards possession to the opposing team.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "throw_in",
      original_referee_decision: "throw_in_awarded",
      review_mode: "call_review",
      verdict: "correct_call",
      confidence: "high",
      key_moment_timestamp: "0:02",
      what_happened:
        "At the moment of release, both of the thrower's feet are clearly off the touchline and the ground.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 15",
        law_title: "The Throw-in",
        section: "Procedure",
        retrieved_chunk_ids: ["law-15-procedure"],
        quoted_rule:
          "have part of each foot on the touchline or on the ground outside the touchline",
      },
      reasoning: [
        "Identify incident: a throw-in where the thrower's footing is in question.",
        "Identify rule: Law 15 requires the thrower to have part of each foot on the touchline or on the ground outside it at the moment of delivery.",
        "Visible evidence: at release, both feet are airborne and inside the field of play.",
        "Compare to rule: the throw is not taken correctly and is retaken by the opposing team.",
        "Compare to original decision: awarding the throw to the opposition matches what the rule prescribes.",
      ],
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
    },
  },
  goal_kick: {
    incident:
      "Attacker stays inside the penalty area and challenges for the ball before it is in play; referee waves play on instead of ordering a retake.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "goal_kick",
      original_referee_decision: "goal_kick_awarded",
      review_mode: "call_review",
      verdict: "bad_call",
      confidence: "medium",
      key_moment_timestamp: "0:03",
      what_happened:
        "An attacker remains inside the penalty area at the moment of the goal kick and plays the ball before it leaves the area.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 16",
        law_title: "The Goal Kick",
        section: "Offences and sanctions",
        retrieved_chunk_ids: ["law-16-offences-and-sanctions"],
        quoted_rule:
          "If an opponent who is in the penalty area when the goal kick is taken, or enters the penalty area before the ball is in play, touches or challenges for the ball before it is in play, the goal kick is retaken.",
      },
      reasoning: [
        "Identify incident: a goal kick where an attacker plays the ball while still inside the penalty area.",
        "Identify rule: Law 16 requires the goal kick to be retaken if an opponent inside the penalty area touches or challenges for the ball before it is in play.",
        "Visible evidence: the attacker is clearly inside the penalty area when contacting the ball, and the ball has not yet left the area.",
        "Compare to rule: the kick should be retaken; the team in possession does not benefit.",
        "Compare to original decision: allowing play to continue does not match what the rule prescribes.",
      ],
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
    },
  },
  corner_kick: {
    incident:
      "Defenders crowd the corner arc within 9.15 m; the kick is taken anyway, the defenders win the header.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "corner_kick",
      original_referee_decision: "corner_kick_awarded",
      review_mode: "call_review",
      verdict: "bad_call",
      confidence: "medium",
      key_moment_timestamp: "0:04",
      what_happened:
        "Two defenders stand approximately 6 m from the corner arc and challenge for the corner; the corner is taken without resetting them.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 17",
        law_title: "The Corner Kick",
        section: "Procedure",
        retrieved_chunk_ids: ["law-17-procedure"],
        quoted_rule:
          "Opponents must remain at least 9.15 m (10 yds) from the corner arc until the ball is in play",
      },
      reasoning: [
        "Identify incident: a corner kick taken with defenders inside the required 9.15 m distance.",
        "Identify rule: Law 17 requires opponents to remain at least 9.15 m from the corner arc until the ball is in play.",
        "Visible evidence: two defenders stand within roughly 6 m of the arc and challenge for the ball at the kick.",
        "Compare to rule: the encroachment is clear; without an advantage to apply, the kick should be retaken.",
        "Compare to original decision: allowing play to continue does not match what the rule prescribes.",
      ],
      evidence_quality: {
        camera_angle: "clear",
        key_moment_visible: true,
        ball_visible_when_needed: true,
        players_visible_when_needed: true,
        field_lines_visible_when_needed: true,
        frame_rate_adequate: true,
        required_context_missing: [],
        issues: [
          "Distance to the corner arc is estimated from the visible 18-yard line.",
        ],
      },
      review_limitations: [],
    },
  },
  ball_in_out: {
    incident:
      "Ball appears to cross the touchline; defender plays it back into the field; assistant flags for a throw-in.",
    output: {
      is_soccer_clip: true,
      detected_incident_type: "ball_in_out",
      original_referee_decision: "throw_in_awarded",
      review_mode: "call_review",
      verdict: "correct_call",
      confidence: "high",
      key_moment_timestamp: "0:05",
      what_happened:
        "The whole of the ball passes over the touchline before the defender plays it back into the field.",
      retrieval_source: "vertex",
      rule_applied: {
        law_number: "Law 9",
        law_title: "The Ball in and out of Play",
        section: "Ball out of play",
        retrieved_chunk_ids: ["law-09-ball-out-of-play-boundary"],
        quoted_rule:
          "it has wholly passed over the goal line or touchline on the ground or in the air",
      },
      reasoning: [
        "Identify incident: the ball travels close to the touchline before being played back into the field.",
        "Identify rule: Law 9 places the ball out of play when its whole circumference has crossed the line on the ground or in the air.",
        "Visible evidence: a frame clearly shows daylight between the ball and the inside edge of the touchline.",
        "Compare to rule: the ball is out; possession to the opposing team via throw-in.",
        "Compare to original decision: awarding the throw-in matches what the rule prescribes.",
      ],
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
    },
  },
  // Pass 2 should not be reached for these — Pass 1 short-circuits — but the
  // record key has to exist to satisfy the type. Leaving null tells the prompt
  // builder to skip the matching-incident slot.
  unsupported: null,
  unknown: null,
};

function renderFewShot(label: string, example: FewShotExample): string {
  return [
    `--- Example: ${label} ---`,
    `Incident: ${example.incident}`,
    "Output:",
    JSON.stringify(example.output, null, 2),
  ].join("\n");
}

function buildFewShotBlock(incidentType: IncidentType): string {
  const matching = PASS_2_FEW_SHOTS[incidentType];
  // No matching example means Pass 2 was reached for an unsupported/unknown
  // incident — skip the few-shot block entirely. Adding an offside example to
  // a prompt that should short-circuit just confuses the model.
  if (!matching) return "";

  const inconclusiveAnchor = PASS_2_FEW_SHOTS.offside;
  const blocks: string[] = [renderFewShot(`${incidentType} (matching)`, matching)];
  // The offside example doubles as the calibration "inconclusive" anchor per
  // PRD §11.8 — useful regardless of incident type because it shows what an
  // honest "I can't tell" verdict looks like. Skip when offside IS the match,
  // since we'd be rendering the same JSON twice.
  if (inconclusiveAnchor && incidentType !== "offside") {
    blocks.push(renderFewShot("offside (inconclusive anchor)", inconclusiveAnchor));
  }

  return [
    "REFERENCE EXAMPLES — study the structure and reasoning shape, not the specifics:",
    "",
    blocks.join("\n\n"),
  ].join("\n");
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

  const fewShotBlock = buildFewShotBlock(args.incidentType);

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

  const sections: string[] = [
    "You are RefCheck AI, a rule-grounded second-review assistant for soccer referee decisions.",
    "",
    `Incident type: ${args.incidentType}`,
    `Applicable law: ${args.lawNumber}`,
    "",
    "RETRIEVED RULE PASSAGES (cite only from these — do not paraphrase from memory):",
    "----- BEGIN PASSAGES -----",
    chunkBlock,
    "----- END PASSAGES -----",
  ];

  if (fewShotBlock) {
    sections.push("", fewShotBlock);
  }

  sections.push(
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
  );

  return sections.join("\n");
}
