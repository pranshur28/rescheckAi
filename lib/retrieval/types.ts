// Common retrieval shape so Vertex and fallback paths return the same thing.

import type { RetrievalSource } from "../types.ts";

export interface RetrievedChunk {
  // Stable identifier the model can cite. Vertex returns its own chunk ids;
  // the fallback path uses the `id` field from data/ifab-rules-fallback.json.
  id: string;
  law_number: string;
  law_title: string;
  section: string;
  text: string;
  // Vertex returns a similarity score; fallback path leaves this null.
  score?: number;
}

export interface RetrievalResult {
  source: RetrievalSource;
  chunks: RetrievedChunk[];
}
