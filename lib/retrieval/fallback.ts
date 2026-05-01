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

// Tokenize a query string into lowercased word terms ≥3 chars. We strip
// stopwords because "and", "the", "of" overlap with everything in the rules
// text and would flatten the score distribution.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "any", "all", "are",
  "was", "were", "has", "have", "had", "but", "not", "into", "out", "off",
  "over", "under", "when", "while", "must", "should", "would", "could",
]);

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreRecord(record: FallbackRecord, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = `${record.section} ${record.text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

export function retrieveFromFallback(
  lawNumber: string,
  k: number,
  queryText = "",
): RetrievalResult {
  const records = loadFallback();
  const candidates = records.filter((r) => r.law_number === lawNumber);
  const terms = tokenizeQuery(queryText);

  // Score by keyword overlap; preserve document order on ties.
  const scored = candidates.map((r, idx) => ({
    record: r,
    score: scoreRecord(r, terms),
    idx,
  }));
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const matches: RetrievedChunk[] = scored.slice(0, k).map(({ record }) => ({
    id: record.id,
    law_number: record.law_number,
    law_title: record.law_title,
    section: record.section,
    text: record.text,
  }));
  return { source: "fallback", chunks: matches };
}

// Test seam: lets unit tests inject a synthetic fallback dataset without
// needing to write a real ifab-rules-fallback.json on disk.
export function _setFallbackCacheForTesting(records: FallbackRecord[] | null): void {
  cache = records;
}
