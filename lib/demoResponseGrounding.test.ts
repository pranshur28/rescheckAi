// Run with: npm test
//
// Cached demo responses in public/demo-responses/*.json bypass the live
// validation pipeline (AnalyzeApp short-circuits to the static JSON when a
// preset is loaded in demo mode). This fixture test re-applies the §11.7
// citation-grounding checks to those static fixtures so they cannot regress
// into ungrounded chunk ids or fabricated rule quotes — i.e. the demo cannot
// show a citation badge that would never have passed production validation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateChunkIds, quotedRuleAppearsInChunks } from "./validation.ts";
import { DEMO_PRESETS } from "./demoPresets.ts";
import type { RetrievedChunk } from "./retrieval/types.ts";
import type { VerdictResponse } from "./types.ts";

const corpus = JSON.parse(
  readFileSync(resolve("data/ifab-rules-fallback.json"), "utf8"),
) as RetrievedChunk[];

function loadDemoResponse(presetId: string): VerdictResponse {
  const path = resolve("public/demo-responses", `${presetId}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as VerdictResponse;
}

for (const preset of DEMO_PRESETS) {
  test(`demo response "${preset.id}" cites real corpus chunks`, () => {
    const resp = loadDemoResponse(preset.id);

    if (resp.rule_applied === null) {
      // Mirrors the validator invariant in lib/validation.ts:127-131:
      // when there is no rule citation, retrieval_source must be "none".
      assert.equal(
        resp.retrieval_source,
        "none",
        `${preset.id}: rule_applied is null but retrieval_source is "${resp.retrieval_source}" — must be "none"`,
      );
      return;
    }

    const idCheck = validateChunkIds(
      resp.rule_applied.retrieved_chunk_ids,
      corpus,
    );
    assert.ok(
      idCheck.allKnown,
      `${preset.id}: hallucinated chunk ids ${idCheck.unknownIds.join(",")}`,
    );

    // Quote-matching only sees the chunks the response actually cites — same
    // as production, where the prompt only gives the model the retrieved set.
    const cited = corpus.filter((c) =>
      resp.rule_applied!.retrieved_chunk_ids.includes(c.id),
    );
    assert.ok(
      quotedRuleAppearsInChunks(resp.rule_applied.quoted_rule, cited),
      `${preset.id}: quoted_rule is not a verbatim substring of any cited chunk`,
    );
  });
}
