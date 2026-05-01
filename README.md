# RefCheck AI

> Was the call fair, or was it a bad call?

RefCheck AI is a rule-grounded second-review assistant for soccer referee decisions. Upload a short clip, and within seconds it returns a verdict — **fair call**, **bad call**, or **inconclusive** — backed by a citation from the IFAB Laws of the Game.

Built for the **GDG BorderHack 2026 Sponsored Challenge**.

**Live app:** https://refcheck-ai-lovat.vercel.app

## What it does

- Accepts a short soccer clip (Cloudinary upload or hosted URL, ≤ 50 MB).
- Optionally takes the original referee call and the incident type as context.
- Runs a two-pass Gemini multimodal analysis: Pass 1 classifies the incident, Pass 2 issues the verdict.
- Retrieves the relevant law from the IFAB rulebook (Vertex AI RAG when configured, structured keyword retrieval as fallback) and grounds the verdict in a verbatim rule citation.
- Returns a structured response: verdict, confidence, key-moment timestamp, what happened, the rule applied, 5-step reasoning, evidence-quality flags, and any review limitations.
- Renders all of the above as a **structured verdict card**.

If the clip doesn't show enough information, RefCheck AI returns **inconclusive** instead of guessing. If a call depends on context outside the clip (player count, match timing, substitution procedure), it says so plainly.

## Coverage

8 IFAB Laws of the Game that are reviewable from a short clip:

| Law | Title | Examples |
|-----|-------|----------|
| Law 9 | The Ball In and Out of Play | Ball wholly over the line |
| Law 11 | Offside | Offside position, interfering with play |
| Law 12 | Fouls and Misconduct | Tripping, handball, careless tackles |
| Law 13 | Free Kicks | Wall distance, procedure |
| Law 14 | The Penalty Kick | Goalkeeper encroachment, retake conditions |
| Law 15 | The Throw-in | Foot placement, delivery |
| Law 16 | The Goal Kick | Procedure, encroachment |
| Law 17 | The Corner Kick | Procedure, defender distance |

Out of scope (rule-based but not video-reviewable from a 30-second clip): Laws 1–8, 10, 18 (field, ball, players, equipment, officials, duration, kick-off, restart, outcome).

## Architecture

```
┌────────┐         ┌────────────────┐         ┌──────────────┐
│ Client │ ──POST─▶│ /api/analyze   │         │ Cloudinary   │
└────────┘         │ (Vercel route) │ ◀──URL──│ (video host) │
   ▲               └───────┬────────┘         └──────────────┘
   │                       │
   │             ┌─────────┴──────────┐
   │             ▼                    ▼
   │   ┌──────────────────┐  ┌────────────────────┐
   │   │ Pass 1: classify │  │ Gemini File API    │
   │   │ (Gemini 2.5)     │  │ (cached upload)    │
   │   └────────┬─────────┘  └────────────────────┘
   │            │ incident_type
   │            ▼
   │   ┌──────────────────────────────┐
   │   │ INCIDENT_TO_LAW (lib/types)  │
   │   └────────┬─────────────────────┘
   │            │ "Law N"
   │            ▼
   │   ┌──────────────────────────────────────────┐
   │   │ Retrieval (lib/retrieval/index.ts)       │
   │   │   primary: Vertex AI RAG (rag_file_ids)  │
   │   │   fallback: keyword over static JSON     │
   │   └────────┬─────────────────────────────────┘
   │            │ retrieved chunks
   │            ▼
   │   ┌──────────────────────────────────────────┐
   │   │ Pass 2: verdict (Gemini 2.5)             │
   │   │   prompt = clip + chunks + schema        │
   │   └────────┬─────────────────────────────────┘
   │            │ raw JSON
   │            ▼
   │   ┌──────────────────────────────────────────┐
   │   │ Validation (lib/validation.ts)           │
   │   │   parse + schema + chunk-id grounding    │
   │   │   + verbatim-quote check + confidence    │
   │   └────────┬─────────────────────────────────┘
   │            │ VerdictResponse
   └────────────┘
```

The retrieval layer is **fail-open**: if Vertex isn't configured (or fails at request time), the request falls through to a structured keyword search over `data/ifab-rules-fallback.json`. The verdict still gets a real IFAB citation either way.

## Setup

### Prerequisites

- Node.js 20+
- A **Gemini API key** (server-side)
- A **Cloudinary** cloud + unsigned upload preset (frontend upload widget)
- *(Optional, for Vertex RAG primary retrieval)* a GCP project, a Vertex AI service account JSON, and a populated `data/law-to-file-id.json` — see [Corpus prep](#corpus-prep-one-time).

### Local dev

```bash
git clone https://github.com/pranshur28/rescheckAi.git
cd rescheckAi
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

### Tests + build

```bash
npm run typecheck   # tsc --noEmit
npm test            # Node test runner over *.test.ts
npm run build       # Next.js production build
```

### Demo mode (optional escape hatch)

Live demos are fragile. Deployments that include cached demo-mode support can switch the preset clips to static responses (no Gemini call, no Vertex call) in either of these ways:

- Append `?demo=1` to the URL, or
- Set `NEXT_PUBLIC_DEMO_MODE_DEFAULT=1` and redeploy.

When that support is present, **only** the preset buttons return cached responses from `public/demo-responses/*.json`. Arbitrary uploads still go through the live API. If those cached-response assets are not present in a checkout, this section is not needed for normal local development.

## Corpus prep (one-time)

The Vertex AI RAG corpus is built offline by `scripts/python/prep_corpus.py`. The flow splits the IFAB PDF into 8 per-law PDFs, uploads them to a GCS bucket, ingests them into a Vertex RAG corpus, and writes the resulting law → file-ID map into `data/law-to-file-id.json`.

```bash
cd scripts/python
python -m venv .venv && source .venv/Scripts/activate
pip install -r requirements.txt

export GOOGLE_CLOUD_PROJECT=...
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

python prep_corpus.py split  --pdf /path/to/ifab.pdf --ranges-json law-page-ranges.json
python prep_corpus.py upload --bucket <your-bucket-name>
python prep_corpus.py ingest --bucket <your-bucket-name> --display-name "ifab-laws-2025"

export RAG_CORPUS_ID=<paste from ingest output>
python prep_corpus.py smoke --law "Law 11" --query "offside offence interfering with play"
```

This is optional — without it, the app uses the keyword-retrieval fallback over `data/ifab-rules-fallback.json` and the only visible difference is the retrieval badge on the verdict card.

## Project structure

```
app/                    Next.js App Router (page + /api/analyze)
components/
  AnalyzeApp.tsx        Upload + form + result wiring
  VerdictCard.tsx       Structured verdict UI (PRD §11.4)
lib/
  analyze.ts            Two-pass orchestrator
  gemini/               Pass 1 + Pass 2 + File API upload + prompts
  retrieval/            Vertex + fallback retrieval
  validation.ts         Parse + schema + grounding + confidence
  types.ts              §11.4 schema + INCIDENT_TO_LAW
data/
  ifab-rules-fallback.json   Static rule store (used by fallback retrieval)
  law-to-file-id.json        Vertex file-ID map (populated by corpus prep)
scripts/
  python/prep_corpus.py      One-time Vertex corpus build
  spike/gemini-video.ts      Local Gemini smoke test
public/
  demo-responses/*.json      Optional cached responses for demo-mode deployments
test-clips/
  ground-truth.json          Optional PRD §12 eval fixture set
  README.md                  Optional local clip placement guide
```

## Tech stack

- **Frontend** — Next.js 15 (App Router), React 19, Tailwind, `next-cloudinary`
- **Server** — Vercel Functions (TypeScript), Node 20
- **AI** — Gemini 2.5 multimodal via `@google/genai`, two-pass flow
- **Retrieval** — Vertex AI RAG Engine (primary), keyword retrieval over local JSON (fallback)
- **Storage** — Cloudinary (clip hosting), GCS (per-law PDF source for Vertex)
- **CI** — GitHub Actions: typecheck + test + build on every PR

## Honest limitations

- **One sport, one rulebook.** Soccer + IFAB only. Adding another sport = new fallback rules + new corpus.
- **30-second clips, single angle.** Many calls require a second angle or replay; in those cases the answer is **inconclusive**, by design.
- **Out-of-clip context isn't fetched.** Substitution procedure, match clock, player count, weather — if the rule needs context the clip can't show, RefCheck names what's missing rather than guessing.
- **Quoted rules are matched verbatim against retrieved chunks.** If the model paraphrases instead of citing, the validation pipeline downgrades confidence to `low`.
- **Cached demo responses are placeholders when enabled.** They should ship valid IFAB-grounded JSON so the live demo never goes black, but real clip + real Gemini will produce different reasoning text.

## Roadmap (v2)

- More sports (basketball + NBA officiating manual is the next obvious target — same architecture, different rulebook).
- VAR-style multi-angle support.
- Officiating crew identification (link to public match reports / box scores) — sponsor brief stretch goal.
- Eval harness wired into CI once the local `test-clips/ground-truth.json` fixture set is available.

## License & credits

[MIT](LICENSE) © 2026 Pranshu Rampal.

Rule passages are excerpts from the [IFAB Laws of the Game](https://www.theifab.com/laws-of-the-game) (2024/25 edition). Used for the purposes of education and review per IFAB's published licensing terms; original copyright remains with The International Football Association Board.

Built for the **GDG BorderHack 2026 Sponsored Challenge**.
