// PRD §11.3 Pass 2 — verdict. Per-incident FPS via videoMetadata (PRD §9).

import { GoogleGenAI, createUserContent } from "@google/genai";
import type { IncidentType, OriginalRefereeDecision, ReviewMode, VerdictResponse } from "../types.ts";
import { PASS_2_FPS } from "../types.ts";
import type { UploadedClip } from "./upload.ts";
import type { RetrievedChunk } from "../retrieval/types.ts";
import { pass2VerdictPrompt } from "./prompts.ts";
import { tryParseModelJson, looksLikeVerdictResponse } from "../validation.ts";

const MODEL = "gemini-2.5-flash";

export interface Pass2Args {
  clip: UploadedClip;
  incidentType: IncidentType;
  lawNumber: string;
  retrievedChunks: RetrievedChunk[];
  originalDecision: OriginalRefereeDecision;
  reviewMode: ReviewMode;
}

export async function runPass2(ai: GoogleGenAI, args: Pass2Args): Promise<VerdictResponse> {
  const fps = PASS_2_FPS[args.incidentType] ?? 1;

  // Per PRD §9, FPS varies per incident via videoMetadata on the Part.
  const videoPart = {
    fileData: { fileUri: args.clip.uri, mimeType: args.clip.mimeType },
    videoMetadata: { fps },
  };

  const prompt = pass2VerdictPrompt({
    incidentType: args.incidentType,
    lawNumber: args.lawNumber,
    retrievedChunks: args.retrievedChunks,
    originalDecision: args.originalDecision,
    reviewMode: args.reviewMode,
  });

  // First attempt.
  let response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([videoPart, prompt]),
  });
  let text = response.text ?? "";
  let parsed = tryParseModelJson(text);

  // Per PRD §11.7 step 1: retry once with a stricter JSON-only repair prompt.
  if (!parsed.ok || !looksLikeVerdictResponse(parsed.value)) {
    const repairPrompt = [
      "Your previous response was not a valid JSON object matching the required schema.",
      "Return ONLY the JSON object, no prose, no markdown fences.",
      "Original prompt follows:",
      "",
      prompt,
    ].join("\n");
    response = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([videoPart, repairPrompt]),
    });
    text = response.text ?? "";
    parsed = tryParseModelJson(text);
  }

  if (!parsed.ok) {
    throw new Error(`Pass 2 unparseable after retry: ${parsed.reason}; raw: ${text.slice(0, 300)}`);
  }
  if (!looksLikeVerdictResponse(parsed.value)) {
    throw new Error(`Pass 2 schema mismatch: ${text.slice(0, 300)}`);
  }
  return parsed.value;
}
