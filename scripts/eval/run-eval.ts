// PRD §12 eval driver. Reads test-clips/ground-truth.json, calls the same
// post-upload pipeline production uses, and reports verdict accuracy, law
// classification accuracy, incident classification accuracy, and retrieval
// grounding rate — overall and broken out by retrieval_source.
//
// Usage:
//   npm run eval                            # all clips
//   npm run eval -- --only 03,04,07         # subset by id
//
// Requires:
//   - GEMINI_API_KEY (calls real Gemini)
//   - test-clips/clips/{filename} for every entry whose id is included
//   - (optional) GOOGLE_CLOUD_PROJECT, VERTEX_LOCATION, RAG_CORPUS_ID,
//     GOOGLE_APPLICATION_CREDENTIALS_JSON if you want to eval the Vertex path
//
// Cost note: each clip is one Gemini upload + one Pass 1 + one Pass 2. Ten
// clips ≈ 20 Gemini calls. Run sparingly while iterating prompts.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

import { analyzeUploadedClip } from "../../lib/analyze.ts";
import {
  uploadLocalToGemini,
  deleteUploaded,
} from "../../lib/gemini/upload.ts";
import type {
  IncidentType,
  OriginalRefereeDecision,
  RetrievalSource,
  Verdict,
} from "../../lib/types.ts";

interface GroundTruthEntry {
  id: string;
  filename: string;
  description: string;
  original_referee_decision: OriginalRefereeDecision;
  expected_incident_type: IncidentType;
  expected_law: string;
  expected_verdict: Verdict;
  notes: string;
}

interface ClipResult {
  id: string;
  expected: {
    verdict: Verdict;
    law: string;
    incident: IncidentType;
  };
  got: {
    verdict: Verdict;
    law: string;
    incident: IncidentType;
    retrieval_source: RetrievalSource;
    chunk_ids: string[];
  };
  verdictCorrect: boolean;
  lawCorrect: boolean;
  incidentCorrect: boolean;
  retrievalGrounded: boolean;
  flags: string[];
  durationMs: number;
}

interface EvalErrorResult {
  id: string;
  error: string;
}

const GROUND_TRUTH_PATH = join(process.cwd(), "test-clips", "ground-truth.json");
const CLIPS_DIR = join(process.cwd(), "test-clips", "clips");

function parseArgs(argv: string[]): { only: Set<string> | null } {
  const only = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only" && argv[i + 1]) {
      for (const id of argv[i + 1].split(",")) {
        if (id.trim()) only.add(id.trim());
      }
      i++;
    }
  }
  return { only: only.size > 0 ? only : null };
}

async function loadGroundTruth(): Promise<GroundTruthEntry[]> {
  if (!existsSync(GROUND_TRUTH_PATH)) {
    throw new Error(
      `${GROUND_TRUTH_PATH} not found. This file is delivered by issue #15. ` +
        `If you're running the eval before that PR merges, copy the file in locally.`,
    );
  }
  const raw = await readFile(GROUND_TRUTH_PATH, "utf8");
  return JSON.parse(raw) as GroundTruthEntry[];
}

async function evalOne(
  ai: GoogleGenAI,
  entry: GroundTruthEntry,
): Promise<ClipResult | EvalErrorResult> {
  const clipPath = join(CLIPS_DIR, entry.filename);
  if (!existsSync(clipPath)) {
    return {
      id: entry.id,
      error: `Local clip missing at ${clipPath}. See test-clips/README.md for sourcing.`,
    };
  }

  const start = Date.now();
  let uploaded: Awaited<ReturnType<typeof uploadLocalToGemini>> | null = null;
  try {
    uploaded = await uploadLocalToGemini(ai, clipPath);
    const outcome = await analyzeUploadedClip(ai, uploaded, {
      originalDecision: entry.original_referee_decision,
      // Always exercise auto-detect during eval — we want to grade Pass 1
      // classification, not skip it by passing a manual incident type.
      incidentType: "auto_detect",
    });

    const r = outcome.response;
    const gotLaw = r.rule_applied?.law_number ?? "";
    const chunkIds = r.rule_applied?.retrieved_chunk_ids ?? [];

    return {
      id: entry.id,
      expected: {
        verdict: entry.expected_verdict,
        law: entry.expected_law,
        incident: entry.expected_incident_type,
      },
      got: {
        verdict: r.verdict,
        law: gotLaw,
        incident: r.detected_incident_type,
        retrieval_source: r.retrieval_source,
        chunk_ids: chunkIds,
      },
      verdictCorrect: r.verdict === entry.expected_verdict,
      lawCorrect: gotLaw === entry.expected_law,
      incidentCorrect: r.detected_incident_type === entry.expected_incident_type,
      retrievalGrounded: chunkIds.length > 0,
      flags: outcome.flags,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return { id: entry.id, error: (err as Error).message };
  } finally {
    if (uploaded) {
      await deleteUploaded(ai, uploaded.name);
    }
  }
}

function isErrorResult(r: ClipResult | EvalErrorResult): r is EvalErrorResult {
  return "error" in r;
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function summarize(results: ClipResult[]): void {
  const total = results.length;
  if (total === 0) return;

  const verdictHits = results.filter((r) => r.verdictCorrect).length;
  const lawHits = results.filter((r) => r.lawCorrect).length;
  const incidentHits = results.filter((r) => r.incidentCorrect).length;
  const grounded = results.filter((r) => r.retrievalGrounded).length;

  console.log("");
  console.log("=== Overall ===");
  console.log(`Clips evaluated:                ${total}`);
  console.log(`Verdict accuracy:               ${pct(verdictHits, total)}  (${verdictHits}/${total})`);
  console.log(`Law classification accuracy:    ${pct(lawHits, total)}  (${lawHits}/${total})`);
  console.log(`Incident classification:        ${pct(incidentHits, total)}  (${incidentHits}/${total})`);
  console.log(`Retrieval grounded:             ${pct(grounded, total)}  (${grounded}/${total})`);

  // Per-retrieval-source breakdown (PRD §11.4 field note).
  const bySource: Record<RetrievalSource, ClipResult[]> = {
    vertex: [],
    fallback: [],
    none: [],
  };
  for (const r of results) bySource[r.got.retrieval_source].push(r);

  for (const source of ["vertex", "fallback", "none"] as RetrievalSource[]) {
    const subset = bySource[source];
    if (subset.length === 0) continue;
    const sv = subset.filter((r) => r.verdictCorrect).length;
    const sl = subset.filter((r) => r.lawCorrect).length;
    console.log("");
    console.log(`=== retrieval_source=${source} (${subset.length} clip${subset.length === 1 ? "" : "s"}) ===`);
    console.log(`  Verdict accuracy:             ${pct(sv, subset.length)}`);
    console.log(`  Law classification accuracy:  ${pct(sl, subset.length)}`);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set; eval calls real Gemini and cannot run without it.");
    process.exit(1);
  }

  const { only } = parseArgs(process.argv.slice(2));
  const groundTruth = await loadGroundTruth();
  const targets = only
    ? groundTruth.filter((e) => only.has(e.id))
    : groundTruth;

  if (targets.length === 0) {
    console.error("No matching ground-truth entries.");
    process.exit(1);
  }

  console.log(`Running eval on ${targets.length} clip${targets.length === 1 ? "" : "s"}...`);
  if (only) console.log(`Filter: --only ${[...only].join(",")}`);
  console.log("");

  const ai = new GoogleGenAI({ apiKey });
  const successes: ClipResult[] = [];
  const failures: EvalErrorResult[] = [];

  for (const entry of targets) {
    const result = await evalOne(ai, entry);
    if (isErrorResult(result)) {
      console.log(`${entry.id}  ERROR  ${result.error}`);
      failures.push(result);
      continue;
    }
    const v = result.verdictCorrect ? "PASS" : "FAIL";
    const l = result.lawCorrect ? "PASS" : "FAIL";
    const i = result.incidentCorrect ? "PASS" : "FAIL";
    const g = result.retrievalGrounded ? "yes" : "no";
    const ms = result.durationMs;
    console.log(
      `${entry.id}  verdict=${v}  law=${l}  incident=${i}  grounded=${g}  source=${result.got.retrieval_source}  (${ms}ms)`,
    );
    if (!result.verdictCorrect) {
      console.log(`     expected=${result.expected.verdict}  got=${result.got.verdict}`);
    }
    if (!result.lawCorrect) {
      console.log(`     expected_law=${result.expected.law}  got_law=${result.got.law}`);
    }
    if (result.flags.length > 0) {
      console.log(`     flags=${result.flags.join("|")}`);
    }
    successes.push(result);
  }

  summarize(successes);

  if (failures.length > 0) {
    console.log("");
    console.log(`=== Errors (${failures.length}) ===`);
    for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
