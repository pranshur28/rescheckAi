import { access, readFile } from "fs/promises";
import path from "path";
import { analyze } from "../../lib/analyze.ts";
import type { OriginalRefereeDecision, RetrievalSource, Verdict } from "../../lib/types.ts";

interface GroundTruthEntry {
  id: string;
  filename: string;
  original_referee_decision: OriginalRefereeDecision;
  expected_verdict: Verdict;
  expected_law: string;
  expected_incident_type: string;
}

interface EvalResult {
  id: string;
  verdictCorrect: boolean;
  lawCorrect: boolean;
  incidentCorrect: boolean;
  retrievalGrounded: boolean;
  retrievalSource: RetrievalSource;
}

const RETRIEVAL_SOURCES: RetrievalSource[] = ["vertex", "fallback", "none"];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function loadGroundTruth(): Promise<GroundTruthEntry[]> {
  const groundTruthPath = path.resolve(process.cwd(), "test-clips", "ground-truth.json");
  let raw: string;
  try {
    raw = await readFile(groundTruthPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ground-truth file at ${groundTruthPath}: ${(error as Error).message}`);
  }

  try {
    return JSON.parse(raw) as GroundTruthEntry[];
  } catch (error) {
    throw new Error(`Invalid JSON in ${groundTruthPath}: ${(error as Error).message}`);
  }
}

async function runEval() {
  const groundTruth = await loadGroundTruth();
  const testClipsDir = path.resolve(process.cwd(), "test-clips", "clips");
  const results: EvalResult[] = [];

  for (const clip of groundTruth) {
    const clipPath = path.join(testClipsDir, clip.filename);

    try {
      await access(clipPath);
    } catch {
      throw new Error(`Missing clip file for ${clip.id}: ${clipPath}`);
    }

    const outcome = await analyze({
      localClipPath: clipPath,
      originalDecision: clip.original_referee_decision,
      incidentType: "auto_detect",
    });

    const verdictCorrect = outcome.response.verdict === clip.expected_verdict;
    const lawCorrect = outcome.response.rule_applied?.law_number === clip.expected_law;
    const incidentCorrect = outcome.response.detected_incident_type === clip.expected_incident_type;
    const retrievalGrounded = (outcome.response.rule_applied?.retrieved_chunk_ids?.length ?? 0) > 0;
    const retrievalSource: RetrievalSource = RETRIEVAL_SOURCES.includes(outcome.response.retrieval_source)
      ? outcome.response.retrieval_source
      : "none";

    results.push({
      id: clip.id,
      verdictCorrect,
      lawCorrect,
      incidentCorrect,
      retrievalGrounded,
      retrievalSource,
    });

    console.log(
      `${clip.id}: verdict=${verdictCorrect ? "PASS" : "FAIL"}, law=${lawCorrect ? "PASS" : "FAIL"}, retrieval_source=${retrievalSource}`,
    );
  }

  const total = results.length;
  const verdictAccuracy = results.filter((r) => r.verdictCorrect).length / total;
  const lawAccuracy = results.filter((r) => r.lawCorrect).length / total;
  const groundedRate = results.filter((r) => r.retrievalGrounded).length / total;

  console.log("");
  console.log(`Verdict accuracy: ${formatPercent(verdictAccuracy)}`);
  console.log(`Law classification accuracy: ${formatPercent(lawAccuracy)}`);
  console.log(`Retrieval grounded: ${formatPercent(groundedRate)}`);
  console.log("");
  console.log("Breakdown by retrieval_source:");

  for (const source of RETRIEVAL_SOURCES) {
    const subset = results.filter((r) => r.retrievalSource === source);
    const count = subset.length;
    const verdictSourceAccuracy = count ? subset.filter((r) => r.verdictCorrect).length / count : 0;
    const lawSourceAccuracy = count ? subset.filter((r) => r.lawCorrect).length / count : 0;
    const groundedSourceRate = count ? subset.filter((r) => r.retrievalGrounded).length / count : 0;

    console.log(
      `  ${source}: ${count} clips — verdict=${formatPercent(verdictSourceAccuracy)}, law=${formatPercent(lawSourceAccuracy)}, grounded=${formatPercent(groundedSourceRate)}`,
    );
  }
}

runEval().catch((error) => {
  console.error(`ERROR: ${(error as Error).message}`);
  process.exit(1);
});
