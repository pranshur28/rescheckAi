/**
 * Hour 1 spike — Gemini video ingestion (PRD v1.7 §16).
 *
 * Goal: confirm at least ONE of these paths works end-to-end before any
 * analyze code is written:
 *   1. File API upload (preferred): upload, poll until ACTIVE, generateContent
 *   2. Inline data fallback: read file as bytes, embed as inlineData Part
 *
 * Also exercises:
 *   - Per-incident FPS via videoMetadata.fps (PRD §9 — fast-action incidents
 *     need 5 FPS or the model misses the key frames).
 *   - File-handle reuse across two generateContent calls (PRD §9 — Pass 1 and
 *     Pass 2 should reuse the same handle to avoid double-uploading).
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/spike/gemini-video.ts ./path/to/clip.mp4
 *
 * Node 22.7+ runs .ts files natively with --experimental-strip-types.
 * Node 24 enables it by default. We're on Node 24.12.
 *
 * This spike does NOT do real soccer analysis — it just confirms the wiring.
 * The actual two-pass prompt design lands in Hour 5.
 */
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";

const MODEL = "gemini-2.5-flash";
const INLINE_LIMIT_BYTES = 20 * 1024 * 1024; // ~20 MB; above this, File API only.
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

function die(msg: string): never {
  console.error(`\n[FAIL] ${msg}\n`);
  process.exit(1);
}

function ok(msg: string): void {
  console.log(`[ OK ] ${msg}`);
}

function step(msg: string): void {
  console.log(`\n--- ${msg} ---`);
}

async function pollUntilActive(
  ai: GoogleGenAI,
  name: string,
): Promise<{ state: string; uri: string; mimeType: string }> {
  const start = Date.now();
  while (true) {
    const f = await ai.files.get({ name });
    if (f.state && f.state !== "PROCESSING") {
      if (f.state === "FAILED") die(`File processing FAILED for ${name}`);
      return {
        state: f.state,
        uri: f.uri ?? die(`File ${name} has no uri`),
        mimeType: f.mimeType ?? die(`File ${name} has no mimeType`),
      };
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      die(`Timeout waiting for ${name} to become ACTIVE`);
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function trialFileApi(ai: GoogleGenAI, clipPath: string): Promise<boolean> {
  step("Path A: File API upload");
  let uploaded;
  try {
    uploaded = await ai.files.upload({
      file: clipPath,
      config: { mimeType: "video/mp4", displayName: basename(clipPath) },
    });
  } catch (e) {
    console.error(`upload threw: ${(e as Error).message}`);
    return false;
  }
  if (!uploaded.name) die("upload returned no file name");
  ok(`Uploaded: ${uploaded.name} (initial state=${uploaded.state})`);

  let active;
  try {
    active = await pollUntilActive(ai, uploaded.name);
  } catch (e) {
    console.error(`poll failed: ${(e as Error).message}`);
    return false;
  }
  process.stdout.write("\n");
  ok(`Active: state=${active.state} uri=${active.uri.slice(0, 80)}...`);

  // Pass-1-shaped call: classification-style, default FPS, tiny prompt.
  step("Pass-1-shaped call (default FPS=1, tiny classification prompt)");
  try {
    const r1 = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        createPartFromUri(active.uri, active.mimeType),
        "In one short sentence, describe what is happening in this clip.",
      ]),
    });
    ok(`Pass 1 response (${(r1.text ?? "").length} chars):`);
    console.log(`     ${(r1.text ?? "").trim().slice(0, 200)}`);
  } catch (e) {
    console.error(`Pass 1 failed: ${(e as Error).message}`);
    return false;
  }

  // Pass-2-shaped call: REUSE the same file handle, set FPS=5 (PRD §9 fast-action).
  step("Pass-2-shaped call (FPS=5 via videoMetadata, REUSED file handle)");
  try {
    const videoPart = {
      fileData: { fileUri: active.uri, mimeType: active.mimeType },
      videoMetadata: { fps: 5 },
    };
    const r2 = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        videoPart,
        "Identify the single most important moment in MM:SS format and explain why it matters in one sentence.",
      ]),
    });
    ok(`Pass 2 response (${(r2.text ?? "").length} chars, file handle reused):`);
    console.log(`     ${(r2.text ?? "").trim().slice(0, 200)}`);
  } catch (e) {
    console.error(`Pass 2 failed: ${(e as Error).message}`);
    return false;
  }

  // Cleanup.
  try {
    await ai.files.delete({ name: uploaded.name });
    ok(`Deleted uploaded file ${uploaded.name}`);
  } catch (e) {
    console.warn(`cleanup warning (non-fatal): ${(e as Error).message}`);
  }

  return true;
}

async function trialInline(ai: GoogleGenAI, clipPath: string, sizeBytes: number): Promise<boolean> {
  step(`Path B: inline data fallback (size=${sizeBytes} bytes)`);
  if (sizeBytes > INLINE_LIMIT_BYTES) {
    console.log(`Skipped: clip is ${sizeBytes} bytes, above inline limit ${INLINE_LIMIT_BYTES}`);
    return false;
  }
  try {
    const bytes = await readFile(clipPath);
    const inlinePart = {
      inlineData: { mimeType: "video/mp4", data: bytes.toString("base64") },
    };
    const r = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        inlinePart,
        "In one short sentence, describe what is happening in this clip.",
      ]),
    });
    ok(`Inline response (${(r.text ?? "").length} chars):`);
    console.log(`     ${(r.text ?? "").trim().slice(0, 200)}`);
    return true;
  } catch (e) {
    console.error(`Inline failed: ${(e as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) die("GEMINI_API_KEY not set");

  const clipPath = process.argv[2];
  if (!clipPath) die("Usage: node scripts/spike/gemini-video.ts <path-to-mp4>");

  const s = await stat(clipPath).catch(() => null);
  if (!s || !s.isFile()) die(`Not a file: ${clipPath}`);
  ok(`Clip: ${clipPath} (${s.size} bytes)`);

  const ai = new GoogleGenAI({ apiKey });

  const fileApiWorked = await trialFileApi(ai, clipPath);
  const inlineWorked = await trialInline(ai, clipPath, s.size);

  step("Spike summary");
  console.log(`  File API path: ${fileApiWorked ? "PASS" : "FAIL"}`);
  console.log(`  Inline path:   ${inlineWorked ? "PASS" : "SKIPPED/FAIL"}`);
  if (!fileApiWorked && !inlineWorked) die("Both paths failed — Hour 1 blocker");
  ok("Hour 1 spike unblocked. Proceed to Hour 2 (corpus prep) / Hour 3 (scaffold) / Hour 5 (analyze).");
}

main().catch((e) => die((e as Error).stack ?? String(e)));
