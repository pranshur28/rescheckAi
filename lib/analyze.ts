// PRD §11 two-pass analyze flow.
// The route handler is a thin wrapper; this is the actual pipeline.

import { GoogleGenAI } from "@google/genai";
import type { AnalyzeRequest } from "./request.ts";
import { INCIDENT_TO_LAW } from "./types.ts";
import type { IncidentType, VerdictResponse } from "./types.ts";
import {
  uploadCloudinaryToGemini,
  deleteUploaded,
  type UploadedClip,
} from "./gemini/upload.ts";
import { runPass1 } from "./gemini/pass1.ts";
import { runPass2 } from "./gemini/pass2.ts";
import { retrieve } from "./retrieval/index.ts";
import { applyValidation, shortCircuitInconclusive } from "./validation.ts";
import { deriveReviewMode } from "./confidence.ts";

export interface AnalyzeOutcome {
  response: VerdictResponse;
  flags: string[];
  promptVersion: string;
}

// AnalyzeRequest minus cloudinaryUrl — used by the eval driver, which
// uploads the local file directly to the Gemini File API and then drives
// the same post-upload pipeline.
export type AnalyzeUploadedRequest = Omit<AnalyzeRequest, "cloudinaryUrl">;

// Post-upload pipeline (Pass 1 → retrieval → Pass 2 → validation), factored
// out so the eval script in scripts/eval/run-eval.ts can reuse it without
// going through Cloudinary. Production analyze() composes this with the
// Cloudinary upload step.
export async function analyzeUploadedClip(
  ai: GoogleGenAI,
  clip: UploadedClip,
  req: AnalyzeUploadedRequest,
): Promise<AnalyzeOutcome> {
  // (2) Pass 1 (skipped if user supplied a manual incident type).
  let incidentType: IncidentType;
  let isSoccerClip = true;
  let keyMomentTimestamp = "00:00";
  let searchTerms: string[] = [];

  if (req.incidentType === "auto_detect") {
    const p1 = await runPass1(ai, clip);
    isSoccerClip = p1.is_soccer_clip;
    incidentType = p1.incident_type;
    keyMomentTimestamp = p1.key_moment_timestamp;
    searchTerms = p1.search_terms;
  } else {
    incidentType = req.incidentType;
  }

  // (3) Short-circuits per PRD §11.4 field notes.
  if (!isSoccerClip) {
    return {
      response: shortCircuitInconclusive({
        isSoccerClip: false,
        detectedIncidentType: "unknown",
        originalDecision: req.originalDecision,
        reason: "Clip does not appear to be soccer.",
        keyMomentTimestamp,
      }),
      flags: ["short-circuit:not-soccer"],
      promptVersion: "p1.0.0",
    };
  }

  if (incidentType === "unsupported" || incidentType === "unknown") {
    const reason =
      incidentType === "unsupported"
        ? "This kind of decision usually requires context the clip cannot provide."
        : "The disputed incident could not be classified from the clip.";
    return {
      response: shortCircuitInconclusive({
        isSoccerClip: true,
        detectedIncidentType: incidentType,
        originalDecision: req.originalDecision,
        reason,
        keyMomentTimestamp,
      }),
      flags: [`short-circuit:${incidentType}`],
      promptVersion: "p1.0.0",
    };
  }

  // (4) Map incident → law. Deterministic lookup (PRD §6).
  const lawNumber = INCIDENT_TO_LAW[incidentType];
  if (!lawNumber) {
    // Defensive — the only entries with null mapping are unsupported/unknown,
    // and we already returned above for those. Treat as inconclusive.
    return {
      response: shortCircuitInconclusive({
        isSoccerClip: true,
        detectedIncidentType: incidentType,
        originalDecision: req.originalDecision,
        reason: `No law mapped for incident type ${incidentType}`,
        keyMomentTimestamp,
      }),
      flags: ["short-circuit:no-law-mapping"],
      promptVersion: "p1.0.0",
    };
  }

  // (5) Retrieve scoped to the mapped law.
  const queryText =
    searchTerms.length > 0
      ? searchTerms.join(" ")
      : `${incidentType} ${lawNumber}`;
  const retrieval = await retrieve(lawNumber, queryText, { topK: 5 });

  // (6) Pass 2 with retrieved chunks.
  const reviewMode = deriveReviewMode(req.originalDecision);
  const raw = await runPass2(ai, {
    clip,
    incidentType,
    lawNumber,
    retrievedChunks: retrieval.chunks,
    originalDecision: req.originalDecision,
    reviewMode,
  });

  // (7) Run validation pipeline (PRD §11.7).
  const { response, flags } = applyValidation(raw, {
    retrievalSource: retrieval.source,
    retrievedChunks: retrieval.chunks,
    originalDecision: req.originalDecision,
  });

  return { response, flags, promptVersion: "p1.0.0" };
}

export async function analyze(req: AnalyzeRequest): Promise<AnalyzeOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey });

  // (1) Upload Cloudinary clip to Gemini File API. Reused across both passes.
  const clip = await uploadCloudinaryToGemini(ai, req.cloudinaryUrl);
  try {
    return await analyzeUploadedClip(ai, clip, req);
  } finally {
    // Best-effort cleanup; never throws.
    await deleteUploaded(ai, clip.name);
  }
}
