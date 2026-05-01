// Upload a Cloudinary-hosted MP4 to the Gemini File API and wait for it to
// become ACTIVE. The same file handle is then reused across Pass 1 and Pass 2
// (PRD §9 — avoids double-uploading).

import { GoogleGenAI } from "@google/genai";

const POLL_INTERVAL_MS = 2_000;
// Route maxDuration is 60s. Budget: ~30s for upload+poll, ~30s for Pass 1 +
// retrieval + Pass 2. If a clip takes longer than 30s to process, we'd rather
// fail fast and fall back to a cached demo response than starve the rest of
// the pipeline.
const POLL_TIMEOUT_MS = 30_000;

export interface UploadedClip {
  name: string;
  uri: string;
  mimeType: string;
}

export async function uploadCloudinaryToGemini(
  ai: GoogleGenAI,
  cloudinaryUrl: string,
): Promise<UploadedClip> {
  const resp = await fetch(cloudinaryUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Cloudinary URL (${resp.status}): ${cloudinaryUrl}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  // Blob is supported in @google/genai's Node upload path; lets us avoid a
  // /tmp file write inside the Netlify Function.
  const blob = new Blob([arrayBuffer], { type: "video/mp4" });

  const uploaded = await ai.files.upload({
    file: blob,
    config: { mimeType: "video/mp4" },
  });
  if (!uploaded.name) throw new Error("Gemini upload returned no file name");

  const start = Date.now();
  let current = uploaded;
  while (current.state === "PROCESSING") {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error(`Timeout waiting for Gemini file ${current.name} to become ACTIVE`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    current = await ai.files.get({ name: current.name as string });
  }

  if (current.state === "FAILED") {
    throw new Error(`Gemini file processing FAILED: ${current.name}`);
  }
  if (!current.uri || !current.mimeType) {
    throw new Error(`Gemini file ready but missing uri/mimeType: ${current.name}`);
  }

  return {
    name: current.name as string,
    uri: current.uri,
    mimeType: current.mimeType,
  };
}

export async function deleteUploaded(ai: GoogleGenAI, name: string): Promise<void> {
  try {
    await ai.files.delete({ name });
  } catch (e) {
    // Cleanup is best-effort; never throw from here.
    console.warn(`[gemini] delete ${name} failed: ${(e as Error).message}`);
  }
}
