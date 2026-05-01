// Public entry point for retrieval.
// Tries Vertex first; on any failure, falls back to the local static JSON.
// Logs the failure reason so we can tell from production logs whether Vertex
// is consistently broken (in which case promote fallback to primary, per
// PRD §16 ship-or-cut #9).

import { retrieveFromVertex } from "./vertex.ts";
import { retrieveFromFallback } from "./fallback.ts";
import type { RetrievalResult } from "./types.ts";

export interface RetrieveOpts {
  topK?: number;
  // If true, skip Vertex entirely. Useful for local dev without GCP creds,
  // and for the demo escape hatch when Vertex is rate-limited.
  forceFallback?: boolean;
}

export async function retrieve(
  lawNumber: string,
  queryText: string,
  opts: RetrieveOpts = {},
): Promise<RetrievalResult> {
  const topK = opts.topK ?? 5;

  if (opts.forceFallback) {
    return retrieveFromFallback(lawNumber, topK);
  }

  try {
    return await retrieveFromVertex(lawNumber, queryText, { topK });
  } catch (err) {
    console.warn(
      `[retrieval] Vertex failed for ${lawNumber}, using fallback. Reason: ${(err as Error).message}`,
    );
    return retrieveFromFallback(lawNumber, topK);
  }
}

export type { RetrievalResult, RetrievedChunk } from "./types.ts";
