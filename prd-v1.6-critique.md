# PRD v1.6 Critique

A review of `prdv1.6.md.txt` organized by severity. The architecture is sound; most issues below are spec gaps or editorial cleanup the v1.6 changelog claims is complete but isn't.

---

## Internal inconsistencies (worth fixing before build)

### 1. "v1.5" leakage in §5 and §9
The changelog says v1.6 is build-ready, but §5 still labels both subsections "In scope for v1.5" and "Out of scope for v1.5." §9 also says "v1.5 decision" on FPS sampling. These should say v1.6 or the headings will mislead anyone skimming.

### 2. Out-of-scope law list is misleading about Law 9
§5 lists "Laws 1, 2, 3, 4, 5, 6, 7, 8 ... and 10" as out of scope, with the parenthetical "beyond restart visibility already covered in Laws 13 to 17." But Law 9 (ball in/out) **is** in scope and isn't a restart law. The sentence reads like Law 9 needs full-match context, contradicting the supported-laws table directly above it.

### 3. Risk table contradicts §9's deferral of frame extraction
§9 says local frame extraction is deferred to v2, and the changelog (item 3) calls out fixing exactly this scope contradiction. But §15's row "Gemini low frame sampling misses fast action" still says mitigation is "Request higher FPS when possible **or extract key frames around the disputed moment.**" That second clause is the deferred capability. Same issue in §17 Q&A "How do you handle fast plays?" — mentions extracting key frames.

### 4. §20 Appendix still links Gemini embeddings docs
The changelog (item 4) says the stale Gemini text-embedding line was removed from §10, but §20 still links `https://ai.google.dev/gemini-api/docs/embeddings`. If embeddings are entirely Vertex's responsibility, that link is dead weight and contradicts the cleanup.

### 5. §11.7 validation rule is redundant with §11.6
§11.7 says: "If `original_referee_decision` is `unknown` and the model returns `correct_call` or `bad_call`, override the verdict to `inconclusive` **and set `review_mode` to `rule_assessment`.**" But per §11.6, `review_mode` is *derived* from `originalDecision === 'unknown'` — it's already `rule_assessment` by the time validation runs. Either remove the override clause or clarify that §11.6 runs before validation.

### 6. `rule_applied` nullability still partly unspecified
§11.4 lists three null cases (unsupported, unknown, not-soccer). But §11.7 also mandates overriding `verdict` to `inconclusive` when `original_referee_decision === 'unknown'`. In that override path, was retrieval performed? If yes, `rule_applied` could be populated; if no, it's null. The spec doesn't say.

---

## Substantive concerns

### 7. Fallback's contract is weaker than advertised
§11.3 fallback returns "the first `k` records in document order" with no ranking — for Law 12 (Fouls and Misconduct), document order has no relationship to relevance. The verdict prompt's "return inconclusive when retrieved chunks do not address the visible incident" is the correct guardrail, but eval (§12) should track verdict accuracy *separately* on the fallback path so the team knows whether the fallback degrades to mostly-inconclusive. §11.4 mentions splitting metrics by `retrieval_source`; §12's eval script doesn't actually do that.

### 8. `v1beta1` + standard-mode constraint is load-bearing and the smoke test is underspecified
The whole architecture rests on metadata filtering. The PRD calls for a smoke test in hour 2, but doesn't define the *exit criterion*: what counts as "metadata filter works"? A query that returns chunks from one law isn't enough — you need to confirm the filter would reject another law's chunks. Add: "smoke test must include a negative case (a query that would semantically match Law 11 with `law_number=Law 12` filter must return only Law 12 chunks)."

### 9. `quoted_rule` substring validation is fragile
§11.7 says "appears verbatim (or as a clear substring)" — "clear substring" is undefined. PDFs introduce ligatures, smart quotes, non-breaking spaces, and soft hyphens that break naive `String.includes` checks. Spec a normalization step (collapse whitespace, normalize unicode quotes/dashes, strip soft hyphens) or this validator will false-positive flag valid responses.

### 10. Latency budget split needs a clearer mapping
§4 says 30s for "demo presets (cached/warm path)" and 60s for "fresh uploads." But §13's demo flow runs a *live* preset clip — is that the cached JSON path or a real Gemini call against a pre-uploaded Cloudinary URL? If it's a real call, it's not a "cached" path and 30s is optimistic. Specify which preset button in §13 maps to which budget.

### 11. `GOOGLE_APPLICATION_CREDENTIALS_JSON` cold-start path needs a timeout spec
§10 says "the function loads JSON from this env var at cold start." Netlify Functions cold-start *per invocation* on the free tier and after idle. If service-account JSON parsing + Vertex auth handshake adds 500–1500ms, that should be in the latency budget for fresh uploads, and the fallback should kick in on auth-handshake timeout, not just on retrieval failure. The PRD doesn't define the timeout that triggers fallback.

### 12. Demo cut item #9 reverses architecture without updating the pitch
Cutting Vertex RAG falls back to "inline IFAB excerpts in the verdict prompt for the 8 supported laws" — exactly what §11.1 spent paragraphs arguing against. Fine as a panic button, but the cut item should also call out that the pitch deck and Q&A talking points (§14, §17) need updating: "retrieval grounding rate" stops being a metric, "rule citations come from retrieval" becomes false. Right now the cut item is silent on the messaging fallout.

### 13. §7 incident-type options vs. §6 mapping table mismatch
§6 has `foul` and `handball` as separate incident types both mapping to Law 12. §7 collapses them into one form option: "Foul or misconduct, handball." Fine for UX, but the form needs to emit one of the two enum values in `incident_type`. Spec which manual selection emits `foul` and which emits `handball`.

---

## Smaller items

### 14. §9 architecture diagram step 8 misuses "ranked by search_terms"
Search_terms aren't a ranking signal in Vertex RAG; they're the query string fed to semantic ranking. Reword as "queried with search_terms, filtered by law_number."

### 15. §11.4 schema uses pipe-delimited enums as JSON values
Strings like `"foul | handball | offside ..."` are a documentation convention but not valid JSON. Annotate as "enum:" in the comment or readers will copy-paste broken JSON.

### 16. §15 risk likelihood for Vertex setup is too optimistic
Likelihood is "Low" but the mitigation says "If Vertex setup blocks past hour 4, fall back to inline IFAB excerpts" — a 2-hour budget for a brand-new GCP integration with a `v1beta1` API constraint suggests likelihood is at least Medium.

### 17. §18 checklist missing the fallback store
"Fallback JSON store committed and smoke-tested" should be a check-off item given §11.3 makes it a hard requirement.

---

## What the PRD does well

- Two-pass pattern with deterministic incident→law mapping is the right call and gives a real story against "just a Gemini wrapper."
- Confidence overwriting in §11.5 and chunk-id validation in §11.7 are exactly the right hallucination guards.
- Honest-framing note on test set size (§12) will save the team from being challenged on "benchmark accuracy."
- Adding the runtime fallback path in v1.6 is the correct response to the `v1beta1` API risk.
