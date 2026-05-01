import { test } from "node:test";
import assert from "node:assert/strict";

import { citationGrounded } from "./run-eval.ts";

test("citationGrounded requires at least one cited chunk", () => {
  assert.equal(citationGrounded([], []), false);
});

test("citationGrounded accepts validated citations", () => {
  assert.equal(citationGrounded(["law-11-offside-position-definition"], []), true);
});

test("citationGrounded rejects quote mismatches", () => {
  assert.equal(
    citationGrounded(
      ["law-11-offside-position-definition"],
      ["quoted-rule-not-in-retrieved-chunks"],
    ),
    false,
  );
});

test("citationGrounded rejects hallucinated chunk ids", () => {
  assert.equal(
    citationGrounded(
      ["made-up-id"],
      ["hallucinated-chunk-ids:made-up-id", "confidence-downgraded:high->low"],
    ),
    false,
  );
});

test("citationGrounded ignores non-grounding flags", () => {
  assert.equal(
    citationGrounded(
      ["law-12-direct-free-kick-careless-reckless-excessive"],
      ["override:unknown-decision-forced-inconclusive (was correct_call)"],
    ),
    true,
  );
});
