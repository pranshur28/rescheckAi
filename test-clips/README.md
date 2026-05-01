# Test clips & ground truth (PRD §12)

`ground-truth.json` is the eval set for `scripts/eval/run-eval.ts`. Ten entries covering 6 distinct laws (Laws 9, 11, 12, 13, 14, 15, 17) plus one adversarial non-soccer clip. Two entries have `expected_verdict: "inconclusive"` (one obstructed-angle offside, one non-soccer adversarial input).

Schema per entry: `id`, `filename`, `description`, `original_referee_decision`, `expected_incident_type`, `expected_law`, `expected_verdict`, `notes`. Valid values for the typed fields come from `lib/types.ts` (`OriginalRefereeDecision`, `IncidentType`).

## Where do the actual `.mp4` clips live?

Locally only — `.gitignore` excludes `test-clips/clips/*.mp4` and `*.mov` per PRD §12's copyright note. To run the eval, drop matching clip files into `test-clips/clips/` so each `filename` resolves. Suggested sources, in order: self-recorded → Wikimedia / Creative Commons → Pexels / Pixabay → broadcast (locally only).

## Coverage summary

| Law | Clips | Verdicts |
|-----|-------|----------|
| Law 9 (Ball in/out) | 1 | bad_call |
| Law 11 (Offside) | 2 | bad_call, inconclusive |
| Law 12 (Fouls) | 2 | correct_call, bad_call |
| Law 13 (Free kicks) | 1 | bad_call |
| Law 14 (Penalty) | 1 | correct_call |
| Law 15 (Throw-in) | 1 | correct_call |
| Law 17 (Corner) | 1 | bad_call |
| (non-soccer) | 1 | inconclusive |
