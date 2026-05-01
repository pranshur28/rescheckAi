// PRD §11.3 fallback retrieval — keyword filter over local static JSON.
// No embeddings. Filter by law_number, return first k records in document order.
// Used as a circuit breaker when Vertex retrieval fails, AND as the primary path
// per ship-or-cut item #9 if Vertex setup blocks before the demo.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RetrievalResult, RetrievedChunk } from "./types.ts";

interface FallbackRecord {
  id: string;
  law_number: string;
  law_title: string;
  section: string;
  text: string;
}

let cache: FallbackRecord[] | null = null;

function loadFallback(): FallbackRecord[] {
  if (cache) return cache;
  // process.cwd() at function runtime in Netlify is the function's bundle root,
  // and netlify.toml's `included_files` puts data/ next to the function.
  const path = join(process.cwd(), "data", "ifab-rules-fallback.json");
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`ifab-rules-fallback.json must be a JSON array, got ${typeof parsed}`);
  }
  cache = parsed as FallbackRecord[];
  return cache;
}

export function retrieveFromFallback(lawNumber: string, k: number): RetrievalResult {
  const records = loadFallback();
  const matches: RetrievedChunk[] = records
    .filter((r) => r.law_number === lawNumber)
    .slice(0, k)
    .map((r) => ({
      id: r.id,
      law_number: r.law_number,
      law_title: r.law_title,
      section: r.section,
      text: r.text,
    }));
  return { source: "fallback", chunks: matches };
}

// Test seam: lets unit tests inject a synthetic fallback dataset without
// needing to write a real ifab-rules-fallback.json on disk.
export function _setFallbackCacheForTesting(records: FallbackRecord[] | null): void {
  cache = records;
}
