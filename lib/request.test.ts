import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnalyzeRequest } from "./request.ts";

const validBody = {
  cloudinaryUrl: "https://res.cloudinary.com/demo/video/upload/v1/sample.mp4",
  originalDecision: "penalty_awarded",
  incidentType: "auto_detect",
};

test("parseAnalyzeRequest accepts a valid Cloudinary URL", () => {
  const r = parseAnalyzeRequest(validBody);
  assert.equal(r.ok, true);
});

test("parseAnalyzeRequest accepts custom subdomain on cloudinary.com", () => {
  const r = parseAnalyzeRequest({
    ...validBody,
    cloudinaryUrl: "https://my-cloud.cloudinary.com/video/upload/v1/sample.mp4",
  });
  assert.equal(r.ok, true);
});

test("parseAnalyzeRequest rejects non-Cloudinary hosts", () => {
  const r = parseAnalyzeRequest({
    ...validBody,
    cloudinaryUrl: "https://evil.example.com/video.mp4",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Cloudinary/i);
});

test("parseAnalyzeRequest rejects look-alike hostnames", () => {
  // Endpoint rejects "cloudinary.com.evil.com" — endsWith(".cloudinary.com")
  // is what we check, and the trailing label matters.
  const r = parseAnalyzeRequest({
    ...validBody,
    cloudinaryUrl: "https://cloudinary.com.evil.com/video.mp4",
  });
  assert.equal(r.ok, false);
});

test("parseAnalyzeRequest rejects URLs without protocol", () => {
  const r = parseAnalyzeRequest({
    ...validBody,
    cloudinaryUrl: "res.cloudinary.com/demo/video.mp4",
  });
  assert.equal(r.ok, false);
});

test("parseAnalyzeRequest rejects unknown originalDecision", () => {
  const r = parseAnalyzeRequest({ ...validBody, originalDecision: "made_up" });
  assert.equal(r.ok, false);
});

test("parseAnalyzeRequest rejects unknown incidentType", () => {
  const r = parseAnalyzeRequest({ ...validBody, incidentType: "made_up" });
  assert.equal(r.ok, false);
});

test("parseAnalyzeRequest rejects missing fields", () => {
  const r = parseAnalyzeRequest({});
  assert.equal(r.ok, false);
});

test("parseAnalyzeRequest rejects non-object input", () => {
  assert.equal(parseAnalyzeRequest(null).ok, false);
  assert.equal(parseAnalyzeRequest("string").ok, false);
  assert.equal(parseAnalyzeRequest(42).ok, false);
});
