"use client";

// Renders a VerdictResponse (PRD §11.4) as a structured card.
// Pure presentational — no fetching, no state. The parent owns the data.

import type {
  Confidence,
  EvidenceQuality,
  RetrievalSource,
  ReviewMode,
  Verdict,
  VerdictResponse,
} from "@/lib/types";

const VERDICT_COPY: Record<Verdict, string> = {
  correct_call: "Correct call",
  bad_call: "Bad call",
  inconclusive: "Inconclusive",
};

// Tailwind color classes are picked at compile time, so we map verdicts to
// fully-qualified class strings rather than string-concatenating bg-{x}.
const VERDICT_BG: Record<Verdict, string> = {
  correct_call: "bg-verdict-correct",
  bad_call: "bg-verdict-bad",
  inconclusive: "bg-verdict-inconclusive",
};

const CAMERA_ANGLE_DOT: Record<EvidenceQuality["camera_angle"], string> = {
  clear: "bg-emerald-500",
  partial: "bg-amber-500",
  obstructed: "bg-red-500",
};

const RETRIEVAL_BADGE_COPY: Partial<Record<RetrievalSource, string>> = {
  vertex: "Vertex RAG",
  fallback: "Static rule store",
};

export default function VerdictCard({ response }: { response: VerdictResponse }) {
  return (
    <section className="space-y-6 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
      {response.review_mode === "rule_assessment" ? (
        <Note>
          Original referee decision was not provided, so RefCheck is in rule
          assessment mode. It explains what the rule says without saying
          whether the referee was right or wrong.
        </Note>
      ) : null}
      <Header
        verdict={response.verdict}
        confidence={response.confidence}
        reviewMode={response.review_mode}
      />

      <Summary
        whatHappened={response.what_happened}
        keyMomentTimestamp={response.key_moment_timestamp}
      />

      <RuleAppliedSection
        ruleApplied={response.rule_applied}
        retrievalSource={response.retrieval_source}
      />

      <ReasoningSection reasoning={response.reasoning} />

      <EvidenceSection evidence={response.evidence_quality} />

      <LimitationsSection limitations={response.review_limitations} />
    </section>
  );
}

function Header({
  verdict,
  confidence,
  reviewMode,
}: {
  verdict: Verdict;
  confidence: Confidence;
  reviewMode: ReviewMode;
}) {
  const badgeText =
    reviewMode === "rule_assessment"
      ? "Rule assessment"
      : VERDICT_COPY[verdict];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-white ${VERDICT_BG[verdict]}`}
      >
        {badgeText}
      </span>
      <span className="inline-flex items-center rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
        Confidence: {confidence}
      </span>
    </div>
  );
}

function Summary({
  whatHappened,
  keyMomentTimestamp,
}: {
  whatHappened: string;
  keyMomentTimestamp: string;
}) {
  if (!whatHappened && !keyMomentTimestamp) return null;
  return (
    <div>
      {whatHappened ? (
        <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
          {whatHappened}
        </p>
      ) : null}
      {keyMomentTimestamp ? (
        <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">
          Key moment: <span className="font-mono">{keyMomentTimestamp}</span>
        </p>
      ) : null}
    </div>
  );
}

function RuleAppliedSection({
  ruleApplied,
  retrievalSource,
}: {
  ruleApplied: VerdictResponse["rule_applied"];
  retrievalSource: RetrievalSource;
}) {
  // PRD §16: when retrieval_source is "none" the pipeline short-circuited
  // before retrieval (non-soccer clip, unsupported incident). Suppress the
  // card and the retrieval badge entirely.
  if (retrievalSource === "none") {
    if (!ruleApplied) {
      return (
        <Note>
          RefCheck couldn&apos;t apply a specific law to this clip — see
          limitations below.
        </Note>
      );
    }
    return null;
  }

  if (!ruleApplied) {
    return (
      <Note>
        RefCheck couldn&apos;t apply a specific law to this clip — see
        limitations below.
      </Note>
    );
  }

  const badgeCopy = RETRIEVAL_BADGE_COPY[retrievalSource];

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {ruleApplied.law_number} — {ruleApplied.law_title}
        </h3>
        {badgeCopy ? (
          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
            {badgeCopy}
          </span>
        ) : null}
      </div>
      {ruleApplied.section ? (
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
          {ruleApplied.section}
        </p>
      ) : null}
      {ruleApplied.quoted_rule ? (
        <blockquote className="border-l-4 border-neutral-400 pl-4 text-sm italic text-neutral-700 dark:border-neutral-600 dark:text-neutral-300">
          “{ruleApplied.quoted_rule}”
          <footer className="mt-2 text-[11px] not-italic uppercase tracking-wide text-neutral-500">
            — IFAB Laws of the Game, {ruleApplied.law_number}
          </footer>
        </blockquote>
      ) : null}
    </div>
  );
}

function ReasoningSection({ reasoning }: { reasoning: string[] }) {
  if (!reasoning || reasoning.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
        Reasoning
      </h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
        {reasoning.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function EvidenceSection({ evidence }: { evidence: EvidenceQuality }) {
  const flags: { key: keyof EvidenceQuality; label: string }[] = [
    { key: "key_moment_visible", label: "Key moment visible" },
    { key: "ball_visible_when_needed", label: "Ball visible when needed" },
    { key: "players_visible_when_needed", label: "Players visible when needed" },
    { key: "field_lines_visible_when_needed", label: "Field lines visible when needed" },
    { key: "frame_rate_adequate", label: "Frame rate adequate" },
  ];

  const issues = evidence.issues ?? [];
  const missingContext = evidence.required_context_missing ?? [];

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
        Evidence quality
      </h3>

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={`inline-block h-2.5 w-2.5 rounded-full ${CAMERA_ANGLE_DOT[evidence.camera_angle]}`}
        />
        <span className="text-neutral-700 dark:text-neutral-300">
          Camera angle: <span className="font-medium">{evidence.camera_angle}</span>
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {flags.map(({ key, label }) => {
          const ok = Boolean(evidence[key]);
          return (
            <li
              key={key}
              className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
            >
              <span
                aria-label={ok ? "yes" : "no"}
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                  ok ? "bg-emerald-500" : "bg-neutral-400 dark:bg-neutral-600"
                }`}
              >
                {ok ? "✓" : "✗"}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ul>

      {issues.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Issues
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingContext.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Required context missing
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
            {missingContext.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LimitationsSection({ limitations }: { limitations: string[] }) {
  if (!limitations || limitations.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
        Limitations
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
        {limitations.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
      {children}
    </p>
  );
}
