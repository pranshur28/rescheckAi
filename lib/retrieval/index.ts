// Public entry point for retrieval.
// Tries Vertex first; on any failure, falls back to the local static JSON.
// If RAG_CORPUS_ID is unset we skip the Vertex attempt entirely — that env
// var is the smoke signal that corpus prep hasn't been run, so trying and
// catching every request just spams the logs with the same warning.

import { retrieveFromVertex } from "./vertex.ts";
import { retrieveFromFallback } from "./fallback.ts";
import type { RetrievalResult } from "./types.ts";

export interface RetrieveOpts {
  topK?: number;
  // If true, skip Vertex entirely. Useful for local dev without GCP creds,
  // and for the demo escape hatch when Vertex is rate-limited.
  forceFallback?: boolean;
}

function vertexConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLOUD_PROJECT &&
      process.env.VERTEX_LOCATION &&
      process.env.RAG_CORPUS_ID &&
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  );
}

export async function retrieve(
  lawNumber: string,
  queryText: string,
  opts: RetrieveOpts = {},
): Promise<RetrievalResult> {
  const topK = opts.topK ?? 5;

  if (opts.forceFallback || !vertexConfigured()) {
    return retrieveFromFallback(lawNumber, topK, queryText);
  }

  try {
    return await retrieveFromVertex(lawNumber, queryText, { topK });
  } catch (err) {
    console.warn(
      `[retrieval] Vertex failed for ${lawNumber}, using fallback. Reason: ${(err as Error).message}`,
    );
    return retrieveFromFallback(lawNumber, topK, queryText);
  }
}

export type { RetrievalResult, RetrievedChunk } from "./types.ts";
