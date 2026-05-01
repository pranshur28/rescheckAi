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
