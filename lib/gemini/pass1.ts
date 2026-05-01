// PRD §11.3 Pass 1 — classification. Default FPS=1 (no timing precision needed).

import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";
import type { IncidentType } from "../types.ts";
import type { UploadedClip } from "./upload.ts";
import { pass1ClassificationPrompt } from "./prompts.ts";
import { tryParseModelJson } from "../validation.ts";

const MODEL = "gemini-2.5-flash";

export interface Pass1Result {
  is_soccer_clip: boolean;
  incident_type: IncidentType;
  key_moment_timestamp: string;
  search_terms: string[];
}

const VALID_INCIDENT_TYPES = new Set<IncidentType>([
  "foul",
  "handball",
  "offside",
  "penalty_kick",
  "free_kick",
  "throw_in",
  "goal_kick",
  "corner_kick",
  "ball_in_out",
  "unsupported",
  "unknown",
]);

export async function runPass1(
  ai: GoogleGenAI,
  clip: UploadedClip,
): Promise<Pass1Result> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([
      createPartFromUri(clip.uri, clip.mimeType),
      pass1ClassificationPrompt(),
    ]),
  });

  const text = response.text ?? "";
  const parsed = tryParseModelJson(text);
  if (!parsed.ok) {
    throw new Error(`Pass 1 returned non-JSON: ${parsed.reason}; raw: ${text.slice(0, 200)}`);
  }

  const v = parsed.value as Partial<Pass1Result>;
  if (typeof v.is_soccer_clip !== "boolean") {
    throw new Error(`Pass 1 missing is_soccer_clip: ${text.slice(0, 200)}`);
  }
  if (typeof v.incident_type !== "string" || !VALID_INCIDENT_TYPES.has(v.incident_type as IncidentType)) {
    throw new Error(`Pass 1 invalid incident_type: ${String(v.incident_type)}`);
  }
  return {
    is_soccer_clip: v.is_soccer_clip,
    incident_type: v.incident_type as IncidentType,
    key_moment_timestamp: typeof v.key_moment_timestamp === "string" ? v.key_moment_timestamp : "00:00",
    search_terms: Array.isArray(v.search_terms) ? v.search_terms.filter((s) => typeof s === "string") : [],
  };
}
