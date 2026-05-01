"use client";

import type {
  Confidence,
  EvidenceQuality,
  RetrievalSource,
  Verdict,
  VerdictResponse,
} from "@/lib/types";

const VERDICT_CFG: Record<
  Verdict,
  { label: string; color: string; tint: string; glyph: string }
> = {
  correct_call: {
    label: "Correct call",
    color: "var(--green)",
    tint: "oklch(62% 0.18 145 / 0.12)",
    glyph: "✓",
  },
  bad_call: {
    label: "Bad call",
    color: "var(--red)",
    tint: "oklch(58% 0.2 25 / 0.12)",
    glyph: "✗",
  },
  inconclusive: {
    label: "Inconclusive",
    color: "var(--amber)",
    tint: "oklch(72% 0.17 75 / 0.12)",
    glyph: "?",
  },
};

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: "var(--green)",
  medium: "var(--amber)",
  low: "var(--red)",
};

const CAMERA_COLOR: Record<EvidenceQuality["camera_angle"], string> = {
  clear: "var(--green)",
  partial: "var(--amber)",
  obstructed: "var(--red)",
};

const RETRIEVAL_BADGE_COPY: Partial<Record<RetrievalSource, string>> = {
  vertex: "IFAB Laws of the Game (vector)",
  fallback: "IFAB Laws of the Game",
};

export default function VerdictCard({ response }: { response: VerdictResponse }) {
  const cfg = VERDICT_CFG[response.verdict];
  const isRuleAssessment = response.review_mode === "rule_assessment";

  return (
    <div
      className="mb-8 overflow-hidden rounded-xl"
      style={{
        border: "1px solid var(--border)",
        animation: "verdict-pop 0.5s cubic-bezier(0.22,1,0.36,1) both",
      }}
    >
      {/* Header strip */}
      <div
        className="flex flex-wrap items-center gap-4 px-7 py-6"
        style={{ background: cfg.tint, borderBottom: `1px solid ${cfg.color}40` }}
      >
        <div
          className="flex items-center gap-2.5 font-barlow uppercase"
          style={{
            fontWeight: 900,
            fontSize: 32,
            letterSpacing: "0.06em",
            color: cfg.color,
          }}
        >
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{
              background: cfg.color,
              fontSize: 18,
              fontWeight: 900,
            }}
          >
            {cfg.glyph}
          </span>
          {isRuleAssessment ? "Rule assessment" : cfg.label}
        </div>

        <div className="ml-auto flex flex-col items-end gap-1">
          <div
            className="font-barlow uppercase"
            style={{
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--fg3)",
            }}
          >
            Confidence
          </div>
          <div
            className="font-barlow uppercase"
            style={{
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "0.06em",
              color: CONFIDENCE_COLOR[response.confidence],
            }}
          >
            {response.confidence}
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex flex-col gap-7 px-7 py-6"
        style={{ background: "var(--bg2)" }}
      >
        {isRuleAssessment ? (
          <Note>
            Original referee decision was not provided, so RefCheck is in rule
            assessment mode. It explains what the rule says without saying
            whether the referee was right or wrong.
          </Note>
        ) : null}

        <Summary
          whatHappened={response.what_happened}
          keyMomentTimestamp={response.key_moment_timestamp}
        />

        <RuleAppliedSection
          ruleApplied={response.rule_applied}
          retrievalSource={response.retrieval_source}
          verdictColor={cfg.color}
        />

        <ReasoningSection
          reasoning={response.reasoning}
          verdictColor={cfg.color}
        />

        <EvidenceSection evidence={response.evidence_quality} />

        <LimitationsSection limitations={response.review_limitations} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-3 flex items-center gap-2.5 font-barlow uppercase"
      style={{
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: "0.14em",
        color: "var(--fg3)",
      }}
    >
      {children}
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
      <div
        className="mb-2.5 flex items-center gap-2.5 font-barlow uppercase"
        style={{
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.14em",
          color: "var(--fg3)",
        }}
      >
        <span>What happened</span>
        {keyMomentTimestamp ? (
          <span
            className="rounded font-mono"
            style={{
              fontSize: 11,
              color: "var(--blue)",
              background: "var(--blue-dim)",
              padding: "2px 8px",
              letterSpacing: "0.04em",
              textTransform: "none",
            }}
          >
            ⏱ {keyMomentTimestamp}
          </span>
        ) : null}
      </div>
      {whatHappened ? (
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.65,
            color: "var(--fg)",
            fontWeight: 400,
          }}
        >
          {whatHappened}
        </p>
      ) : null}
    </div>
  );
}

function RuleAppliedSection({
  ruleApplied,
  retrievalSource,
  verdictColor,
}: {
  ruleApplied: VerdictResponse["rule_applied"];
  retrievalSource: RetrievalSource;
  verdictColor: string;
}) {
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
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: "var(--bg3)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <span
            className="mb-0.5 block font-mono"
            style={{
              fontSize: 11,
              color: "var(--blue)",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}
          >
            {ruleApplied.law_number}
          </span>
          <span
            className="font-barlow uppercase"
            style={{
              fontWeight: 700,
              fontSize: 17,
              color: "var(--fg)",
              letterSpacing: "0.03em",
            }}
          >
            {ruleApplied.law_title}
          </span>
        </div>
        {badgeCopy ? (
          <span
            className="font-barlow uppercase"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "var(--fg3)",
              border: "1px solid var(--border)",
              padding: "3px 9px",
              borderRadius: 4,
            }}
          >
            {badgeCopy}
          </span>
        ) : null}
      </div>
      {ruleApplied.section ? (
        <div
          className="px-[18px] pt-2 font-mono uppercase"
          style={{
            fontSize: 11,
            color: "var(--fg3)",
            letterSpacing: "0.04em",
          }}
        >
          {ruleApplied.section}
        </div>
      ) : null}
      {ruleApplied.quoted_rule ? (
        <blockquote
          className="mx-[18px] mb-[18px] mt-3 italic"
          style={{
            borderLeft: `3px solid ${verdictColor}`,
            paddingLeft: 16,
            fontSize: 13,
            color: "var(--fg2)",
            lineHeight: 1.7,
          }}
        >
          &ldquo;{ruleApplied.quoted_rule}&rdquo;
          <footer
            className="mt-2 font-mono uppercase"
            style={{
              fontSize: 10,
              fontStyle: "normal",
              letterSpacing: "0.06em",
              color: "var(--fg3)",
            }}
          >
            — IFAB Laws of the Game, {ruleApplied.law_number}
          </footer>
        </blockquote>
      ) : null}
    </div>
  );
}

function ReasoningSection({
  reasoning,
  verdictColor,
}: {
  reasoning: string[];
  verdictColor: string;
}) {
  if (!reasoning || reasoning.length === 0) return null;
  return (
    <div>
      <SectionLabel>Reasoning</SectionLabel>
      <ol className="flex list-none flex-col gap-2 p-0">
        {reasoning.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="font-barlow"
              style={{
                fontWeight: 900,
                fontSize: 13,
                color: verdictColor,
                minWidth: 22,
                letterSpacing: "0.04em",
              }}
            >
              {i + 1}.
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--fg2)",
                lineHeight: 1.6,
              }}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EvidenceSection({ evidence }: { evidence: EvidenceQuality }) {
  const flags: { key: keyof EvidenceQuality; label: string }[] = [
    { key: "key_moment_visible", label: "Key moment visible" },
    { key: "ball_visible_when_needed", label: "Ball visible" },
    { key: "players_visible_when_needed", label: "Players visible" },
    { key: "field_lines_visible_when_needed", label: "Field lines visible" },
    { key: "frame_rate_adequate", label: "Frame rate adequate" },
  ];

  const issues = evidence.issues ?? [];
  const missingContext = evidence.required_context_missing ?? [];
  const cameraColor = CAMERA_COLOR[evidence.camera_angle];

  return (
    <div>
      <SectionLabel>Evidence Quality</SectionLabel>

      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: cameraColor,
            boxShadow: `0 0 6px ${cameraColor}`,
          }}
        />
        <span style={{ fontSize: 13, color: "var(--fg2)" }}>
          Camera angle:{" "}
          <strong style={{ color: "var(--fg)" }}>
            {evidence.camera_angle}
          </strong>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {flags.map(({ key, label }) => {
          const ok = Boolean(evidence[key]);
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: ok ? "var(--green)" : "var(--bg3)",
                  border: ok ? "none" : "1px solid var(--border2)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: ok ? "#fff" : "var(--fg3)",
                }}
              >
                {ok ? "✓" : "✗"}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: ok ? "var(--fg2)" : "var(--fg3)",
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {issues.length > 0 ? (
        <div className="mt-3.5">
          <div
            className="mb-1.5 font-barlow uppercase"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "var(--fg3)",
            }}
          >
            Issues
          </div>
          <ul className="flex list-none flex-col gap-1 p-0">
            {issues.map((issue, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5"
                style={{ fontSize: 12, color: "var(--red)" }}
              >
                <span>—</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingContext.length > 0 ? (
        <div className="mt-3.5">
          <div
            className="mb-1.5 font-barlow uppercase"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "var(--fg3)",
            }}
          >
            Required context missing
          </div>
          <ul className="flex list-none flex-col gap-1 p-0">
            {missingContext.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2"
                style={{
                  fontSize: 12,
                  color: "var(--fg3)",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "var(--border2)" }}>›</span>
                <span>{item}</span>
              </li>
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
      <SectionLabel>Limitations</SectionLabel>
      <ul className="flex list-none flex-col gap-1 p-0">
        {limitations.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2"
            style={{
              fontSize: 12,
              color: "var(--fg3)",
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: "var(--border2)", flexShrink: 0 }}>›</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-lg"
      style={{
        background: "oklch(65% 0.2 255 / 0.08)",
        border: "1px solid oklch(65% 0.2 255 / 0.25)",
        padding: "10px 14px",
        fontSize: 12,
        color: "oklch(75% 0.15 255)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}
