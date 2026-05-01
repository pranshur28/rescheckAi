import { test } from "node:test";
import assert from "node:assert/strict";
import { retrieveFromFallback, _setFallbackCacheForTesting } from "./fallback.ts";

const synthetic = [
  {
    id: "a",
    law_number: "Law 11",
    law_title: "Offside",
    section: "Position",
    text: "A player is in an offside position if any part of the head, body or feet is nearer to the opponents' goal line than both the ball and the second-last opponent.",
  },
  {
    id: "b",
    law_number: "Law 11",
    law_title: "Offside",
    section: "Offence",
    text: "A player is only penalised when interfering with play, interfering with an opponent, or gaining an advantage.",
  },
  {
    id: "c",
    law_number: "Law 11",
    law_title: "Offside",
    section: "No offence",
    text: "There is no offside offence if the player receives the ball directly from a goal kick, throw-in, or corner kick.",
  },
  {
    id: "d",
    law_number: "Law 12",
    law_title: "Fouls",
    section: "Direct free kick",
    text: "A direct free kick is awarded for kicking, tripping, or charging an opponent.",
  },
];

test("retrieveFromFallback filters by law_number", () => {
  _setFallbackCacheForTesting(synthetic);
  const r = retrieveFromFallback("Law 12", 5);
  assert.equal(r.source, "fallback");
  assert.equal(r.chunks.length, 1);
  assert.equal(r.chunks[0].id, "d");
});

test("retrieveFromFallback ranks by keyword overlap", () => {
  _setFallbackCacheForTesting(synthetic);
  // Query about goal kick / corner kick should rank record "c" first.
  const r = retrieveFromFallback("Law 11", 3, "goal kick corner kick throw-in");
  assert.equal(r.chunks[0].id, "c");
});

test("retrieveFromFallback falls back to document order on empty query", () => {
  _setFallbackCacheForTesting(synthetic);
  const r = retrieveFromFallback("Law 11", 3, "");
  assert.deepEqual(r.chunks.map((c) => c.id), ["a", "b", "c"]);
});

test("retrieveFromFallback respects k", () => {
  _setFallbackCacheForTesting(synthetic);
  const r = retrieveFromFallback("Law 11", 2);
  assert.equal(r.chunks.length, 2);
});

test("retrieveFromFallback returns empty for unmatched law", () => {
  _setFallbackCacheForTesting(synthetic);
  const r = retrieveFromFallback("Law 99", 5);
  assert.equal(r.chunks.length, 0);
});

// Integration: exercise the real curated corpus from data/ifab-rules-fallback.json.
// This proves the file shipped with the PR loads, parses, and produces the
// chunks the validation pipeline expects. Without this, an empty Vertex
// law-to-file-id.json followed by a malformed fallback file would crash the
// API at runtime even though all unit tests pass.
test("retrieveFromFallback loads real curated corpus from disk", () => {
  // null clears the test cache so loadFallback() reads the real JSON file.
  _setFallbackCacheForTesting(null);

  // Spot-check each of the 8 supported laws returns at least one chunk
  // with non-stub content. Iterate so a missing law fails the test loudly.
  const supportedLaws = [
    "Law 9",
    "Law 11",
    "Law 12",
    "Law 13",
    "Law 14",
    "Law 15",
    "Law 16",
    "Law 17",
  ];
  for (const lawNumber of supportedLaws) {
    const r = retrieveFromFallback(lawNumber, 5, "");
    assert.ok(r.chunks.length > 0, `${lawNumber} produced no chunks from real corpus`);
    for (const chunk of r.chunks) {
      assert.equal(chunk.law_number, lawNumber);
      assert.ok(chunk.text.length > 0, `${chunk.id} has empty text`);
      assert.ok(
        !chunk.text.includes("STUB CONTENT"),
        `${chunk.id} still has STUB CONTENT — fallback not curated`,
      );
      assert.ok(
        !chunk.id.startsWith("STUB-"),
        `${chunk.id} still has STUB- prefix`,
      );
    }
  }
});
