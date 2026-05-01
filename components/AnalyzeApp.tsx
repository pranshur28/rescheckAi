"use client";

import { useEffect, useState } from "react";
import { CldUploadWidget } from "next-cloudinary";
import { DEMO_PRESETS } from "@/lib/demoPresets";
import {
  ORIGINAL_DECISION_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
} from "@/lib/formOptions";
import type {
  IncidentType,
  OriginalRefereeDecision,
  VerdictResponse,
} from "@/lib/types";
import VerdictCard from "@/components/VerdictCard";
import AnalyzingState from "@/components/AnalyzingState";

type AnalyzeStatus = "idle" | "submitting" | "succeeded" | "failed";

const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const DEMO_MODE_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE_DEFAULT === "1";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AnalyzeApp() {
  const [clipUrl, setClipUrl] = useState<string>("");
  const [originalDecision, setOriginalDecision] =
    useState<OriginalRefereeDecision>("foul_called");
  const [incidentType, setIncidentType] = useState<IncidentType | "auto_detect">(
    "auto_detect",
  );
  const [status, setStatus] = useState<AnalyzeStatus>("idle");
  const [result, setResult] = useState<VerdictResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [isDemoModeQuery, setIsDemoModeQuery] = useState(false);
  const [selectedDemoPresetId, setSelectedDemoPresetId] = useState<string | null>(null);
  const [isDemoResponse, setIsDemoResponse] = useState(false);

  const cloudinaryConfigured = Boolean(UPLOAD_PRESET && CLOUD_NAME);
  const isDemoMode = isDemoModeQuery || DEMO_MODE_DEFAULT;

  useEffect(() => {
    setIsDemoModeQuery(
      new URLSearchParams(window.location.search).get("demo") === "1",
    );
  }, []);

  function loadPreset(presetId: string) {
    const preset = DEMO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setClipUrl(preset.cloudinaryUrl);
    setOriginalDecision(preset.originalDecision);
    setIncidentType(preset.incidentType);
    setSelectedDemoPresetId(preset.id);
    setIsDemoResponse(false);
    setResult(null);
    setError("");
    setStatus("idle");
  }

  async function handleSubmit() {
    if (!clipUrl) {
      setError("Upload a clip or load a demo preset first.");
      return;
    }

    setStatus("submitting");
    setError("");
    setResult(null);
    setIsDemoResponse(false);

    if (isDemoMode && selectedDemoPresetId) {
      try {
        const resp = await fetch(`/demo-responses/${selectedDemoPresetId}.json`);
        if (!resp.ok) {
          setStatus("failed");
          setError(`Demo response not found (${resp.status})`);
          return;
        }

        const json = (await resp.json()) as VerdictResponse;
        await sleep(1500);
        setResult(json);
        setStatus("succeeded");
        setIsDemoResponse(true);
        return;
      } catch (err) {
        setStatus("failed");
        setError((err as Error).message);
        return;
      }
    }

    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudinaryUrl: clipUrl,
          originalDecision,
          incidentType,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus("failed");
        setError(
          (json as { error?: string }).error ??
            `Analyze request failed (${resp.status})`,
        );
        return;
      }
      setResult(json as VerdictResponse);
      setStatus("succeeded");
      setIsDemoResponse(false);
    } catch (err) {
      setStatus("failed");
      setError((err as Error).message);
    }
  }

  function handleReset() {
    setStatus("idle");
    setResult(null);
    setClipUrl("");
    setSelectedDemoPresetId(null);
    setError("");
    setIsDemoResponse(false);
  }

  const canAnalyze = Boolean(clipUrl) && status !== "submitting";
  const showResults = status === "succeeded" && result !== null;
  const showAnalyzing = status === "submitting";

  return (
    <div
      className="flex min-h-screen flex-col items-center pb-20"
      style={{ background: "var(--bg)" }}
    >
      {/* Sticky nav */}
      <header
        className="sticky top-0 z-10 flex h-14 w-full items-center gap-3 px-6"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        <div
          className="flex items-center gap-2 font-barlow uppercase"
          style={{
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "0.03em",
            color: "var(--fg)",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--blue)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          RefCheck
          <span
            className="font-barlow uppercase text-white"
            style={{
              background: "var(--blue)",
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: "0.12em",
              padding: "2px 7px",
              borderRadius: 3,
            }}
          >
            AI
          </span>
        </div>
        <span
          className="ml-auto"
          style={{
            fontSize: 12,
            color: "var(--fg3)",
            letterSpacing: "0.04em",
          }}
        >
          IFAB-cited · Soccer only · GDG BorderHack 2026
        </span>
      </header>

      <main className="flex w-full max-w-[720px] flex-col px-6 pt-12">
        {showResults ? (
          <ResultsView
            result={result!}
            isDemoResponse={isDemoResponse}
            selectedDemoPresetId={selectedDemoPresetId}
            onReset={handleReset}
          />
        ) : showAnalyzing ? (
          <AnalyzingState />
        ) : (
          <InputView
            clipUrl={clipUrl}
            selectedDemoPresetId={selectedDemoPresetId}
            originalDecision={originalDecision}
            incidentType={incidentType}
            cloudinaryConfigured={cloudinaryConfigured}
            canAnalyze={canAnalyze}
            error={error}
            onLoadPreset={loadPreset}
            onSetClipUrl={(url) => {
              setClipUrl(url);
              setSelectedDemoPresetId(null);
            }}
            onChangeOriginalDecision={(v) => {
              setOriginalDecision(v);
              setSelectedDemoPresetId(null);
            }}
            onChangeIncidentType={(v) => {
              setIncidentType(v);
              setSelectedDemoPresetId(null);
            }}
            onAnalyze={handleSubmit}
          />
        )}
      </main>
    </div>
  );
}

function ResultsView({
  result,
  isDemoResponse,
  selectedDemoPresetId,
  onReset,
}: {
  result: VerdictResponse;
  isDemoResponse: boolean;
  selectedDemoPresetId: string | null;
  onReset: () => void;
}) {
  const presetLabel = selectedDemoPresetId
    ? DEMO_PRESETS.find((p) => p.id === selectedDemoPresetId)?.label
    : "Clip";

  return (
    <div style={{ animation: "fade-up 0.4s ease both" }}>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div
            className="font-barlow uppercase"
            style={{
              fontWeight: 900,
              fontSize: 42,
              letterSpacing: "0.02em",
              color: "var(--fg)",
              lineHeight: 1,
            }}
          >
            Verdict
          </div>
          <div
            className="mt-1 font-mono"
            style={{ fontSize: 12, color: "var(--fg3)" }}
          >
            {presetLabel} · IFAB-cited
          </div>
        </div>
        <button
          onClick={onReset}
          className="font-barlow uppercase"
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            color: "var(--fg2)",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.06em",
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          ← New clip
        </button>
      </div>

      {isDemoResponse ? (
        <div
          className="mb-4 inline-flex rounded-full font-barlow uppercase"
          style={{
            border: "1px solid oklch(72% 0.17 75 / 0.4)",
            background: "oklch(72% 0.17 75 / 0.12)",
            color: "var(--amber)",
            padding: "4px 12px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
          }}
        >
          Demo mode (cached)
        </div>
      ) : null}

      <VerdictCard response={result} />
    </div>
  );
}

interface InputViewProps {
  clipUrl: string;
  selectedDemoPresetId: string | null;
  originalDecision: OriginalRefereeDecision;
  incidentType: IncidentType | "auto_detect";
  cloudinaryConfigured: boolean;
  canAnalyze: boolean;
  error: string;
  onLoadPreset: (id: string) => void;
  onSetClipUrl: (url: string) => void;
  onChangeOriginalDecision: (v: OriginalRefereeDecision) => void;
  onChangeIncidentType: (v: IncidentType | "auto_detect") => void;
  onAnalyze: () => void;
}

function InputView({
  clipUrl,
  selectedDemoPresetId,
  originalDecision,
  incidentType,
  cloudinaryConfigured,
  canAnalyze,
  error,
  onLoadPreset,
  onSetClipUrl,
  onChangeOriginalDecision,
  onChangeIncidentType,
  onAnalyze,
}: InputViewProps) {
  return (
    <div>
      {/* Hero */}
      <div className="mb-12" style={{ animation: "fade-up 0.5s ease both" }}>
        <h1
          className="mb-4 font-barlow uppercase"
          style={{
            fontWeight: 900,
            fontSize: 72,
            lineHeight: 0.9,
            letterSpacing: "-0.01em",
            color: "var(--fg)",
          }}
        >
          Was the
          <br />
          call fair?
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--fg2)",
            lineHeight: 1.6,
            maxWidth: 480,
          }}
        >
          Rule-grounded second-review for soccer referee decisions. Upload a
          clip, get an IFAB-cited verdict in under 30 seconds.
        </p>
      </div>

      {/* Demo presets */}
      <Section delay="0.05s">
        <SectionLabel>Try a demo preset</SectionLabel>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {DEMO_PRESETS.map((preset) => {
            const active = selectedDemoPresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onLoadPreset(preset.id)}
                className="cursor-pointer rounded-lg p-3 text-left transition-colors"
                style={{
                  background: active ? "var(--blue-dim)" : "var(--bg3)",
                  border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
                  color: "var(--fg)",
                }}
              >
                <div
                  className="mb-1 font-barlow uppercase"
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: "0.04em",
                    color: "var(--fg)",
                  }}
                >
                  {preset.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--fg3)",
                    lineHeight: 1.4,
                  }}
                >
                  {preset.presenterNote}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Upload */}
      <Section delay="0.1s">
        <SectionLabel>
          <StepNum>01</StepNum>
          Upload a soccer clip
        </SectionLabel>

        <UploadZone
          clipUrl={clipUrl}
          selectedDemoPresetId={selectedDemoPresetId}
          cloudinaryConfigured={cloudinaryConfigured}
          onUploaded={onSetClipUrl}
        />
      </Section>

      {/* Decision form */}
      <Section delay="0.15s">
        <SectionLabel>
          <StepNum>02</StepNum>
          Tell us about the call
        </SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Original referee decision</FieldLabel>
            <Select
              value={originalDecision}
              onChange={(v) =>
                onChangeOriginalDecision(v as OriginalRefereeDecision)
              }
              options={ORIGINAL_DECISION_OPTIONS}
            />
          </div>
          <div>
            <FieldLabel>Incident type</FieldLabel>
            <Select
              value={incidentType}
              onChange={(v) =>
                onChangeIncidentType(v as IncidentType | "auto_detect")
              }
              options={INCIDENT_TYPE_OPTIONS}
            />
          </div>
        </div>
        {originalDecision === "unknown" ? (
          <div
            className="mt-3.5 rounded-lg"
            style={{
              background: "oklch(65% 0.2 255 / 0.08)",
              border: "1px solid oklch(65% 0.2 255 / 0.25)",
              padding: "10px 14px",
              fontSize: 12,
              color: "oklch(75% 0.15 255)",
              lineHeight: 1.5,
            }}
          >
            Without the original decision, RefCheck switches to{" "}
            <strong>rule assessment mode</strong> — it explains what the rule
            says without judging whether the call was right or wrong.
          </div>
        ) : null}
      </Section>

      {/* Analyze button */}
      <div style={{ animation: "fade-up 0.4s ease both", animationDelay: "0.2s" }}>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!canAnalyze}
          className="mb-4 w-full font-barlow uppercase"
          style={{
            background: canAnalyze ? "var(--blue)" : "var(--bg3)",
            color: canAnalyze ? "#fff" : "var(--fg3)",
            border: `1px solid ${canAnalyze ? "var(--blue)" : "var(--border)"}`,
            borderRadius: 9,
            padding: "15px 24px",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.08em",
            cursor: canAnalyze ? "pointer" : "not-allowed",
            transition: "background 0.15s, transform 0.1s",
          }}
        >
          {clipUrl ? "Analyze clip →" : "Upload a clip to continue"}
        </button>

        <div
          className="flex flex-wrap items-center gap-4 font-mono"
          style={{
            fontSize: 11,
            color: "var(--fg3)",
            letterSpacing: "0.04em",
          }}
        >
          <span>⚡ ~30s via Gemini 2.5</span>
          <span>📖 IFAB Laws of the Game</span>
          <span>🔒 Clip not stored</span>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-lg"
            style={{
              background: "oklch(58% 0.2 25 / 0.1)",
              border: "1px solid oklch(58% 0.2 25 / 0.3)",
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--red)",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UploadZone({
  clipUrl,
  selectedDemoPresetId,
  cloudinaryConfigured,
  onUploaded,
}: {
  clipUrl: string;
  selectedDemoPresetId: string | null;
  cloudinaryConfigured: boolean;
  onUploaded: (url: string) => void;
}) {
  const hasFile = Boolean(clipUrl) && !selectedDemoPresetId;
  const hasPreset = Boolean(selectedDemoPresetId);
  const presetNote = selectedDemoPresetId
    ? DEMO_PRESETS.find((p) => p.id === selectedDemoPresetId)?.presenterNote
    : "";

  const zoneStyle: React.CSSProperties = {
    border: `2px dashed ${hasFile ? "var(--green)" : "var(--border2)"}`,
    borderRadius: 10,
    padding: "36px 24px",
    textAlign: "center",
    cursor: cloudinaryConfigured ? "pointer" : "not-allowed",
    transition: "border-color 0.2s, background 0.2s",
    background: hasFile
      ? "oklch(62% 0.18 145 / 0.06)"
      : "var(--bg3)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  };

  const inner = hasFile ? (
    <UploadedState clipUrl={clipUrl} />
  ) : hasPreset ? (
    <PresetState note={presetNote ?? ""} />
  ) : (
    <EmptyState configured={cloudinaryConfigured} />
  );

  if (!cloudinaryConfigured) {
    return (
      <>
        <div style={zoneStyle}>{inner}</div>
        <p
          className="mt-3 rounded-lg"
          style={{
            background: "oklch(72% 0.17 75 / 0.08)",
            border: "1px solid oklch(72% 0.17 75 / 0.3)",
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--amber)",
            lineHeight: 1.5,
          }}
        >
          Cloudinary not configured. Set{" "}
          <code style={{ fontFamily: "var(--mono)" }}>
            NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
          </code>{" "}
          and{" "}
          <code style={{ fontFamily: "var(--mono)" }}>
            NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
          </code>
          . Demo presets still work.
        </p>
      </>
    );
  }

  return (
    <CldUploadWidget
      uploadPreset={UPLOAD_PRESET}
      options={{
        sources: ["local"],
        multiple: false,
        resourceType: "video",
        maxFileSize: 50 * 1024 * 1024,
        clientAllowedFormats: ["mp4", "mov", "webm"],
        folder: "refcheck-clips",
      }}
      onSuccess={(result) => {
        if (
          result?.info &&
          typeof result.info === "object" &&
          "secure_url" in result.info
        ) {
          const info = result.info as { secure_url?: string };
          if (info.secure_url) {
            onUploaded(info.secure_url);
          }
        }
      }}
    >
      {({ open }) => (
        <div onClick={() => open()} style={zoneStyle}>
          {inner}
        </div>
      )}
    </CldUploadWidget>
  );
}

function EmptyState({ configured }: { configured: boolean }) {
  return (
    <>
      <UploadIcon>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg3)"
          strokeWidth="2"
        >
          <polyline points="16 16 12 12 8 16" />
          <line x1="12" y1="12" x2="12" y2="21" />
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
        </svg>
      </UploadIcon>
      <UploadTitle>
        {configured ? "Drop a clip or click to browse" : "Upload disabled"}
      </UploadTitle>
      <UploadSub>MP4, MOV, WebM · max 50 MB</UploadSub>
    </>
  );
}

function PresetState({ note }: { note: string }) {
  return (
    <>
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: "var(--blue-dim)",
          border: "1px solid var(--blue)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--blue)"
          strokeWidth="2"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      </div>
      <UploadTitle color="var(--blue)">Demo preset loaded</UploadTitle>
      <UploadSub>{note || "Click to upload your own clip instead"}</UploadSub>
    </>
  );
}

function UploadedState({ clipUrl }: { clipUrl: string }) {
  const filename = (() => {
    try {
      return decodeURIComponent(clipUrl.split("/").pop() ?? clipUrl);
    } catch {
      return clipUrl.split("/").pop() ?? clipUrl;
    }
  })();

  return (
    <>
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: "oklch(62% 0.18 145 / 0.15)",
          border: "1px solid var(--green)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--green)"
          strokeWidth="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <UploadTitle color="var(--green)">{filename}</UploadTitle>
      <UploadSub>Click to replace</UploadSub>
    </>
  );
}

function UploadIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full"
      style={{
        background: "var(--bg3)",
        border: "1px solid var(--border2)",
        fontSize: 18,
      }}
    >
      {children}
    </div>
  );
}

function UploadTitle({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      className="font-barlow"
      style={{
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: "0.04em",
        color: color ?? "var(--fg)",
      }}
    >
      {children}
    </div>
  );
}

function UploadSub({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--fg3)" }}>{children}</div>
  );
}

function Section({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay?: string;
}) {
  return (
    <div
      className="mb-4 rounded-[10px] px-7 py-6"
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        animation: "fade-up 0.4s ease both",
        animationDelay: delay,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 flex items-center gap-2.5 font-barlow uppercase"
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

function StepNum({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-barlow"
      style={{
        fontWeight: 900,
        fontSize: 13,
        color: "var(--blue)",
        background: "var(--blue-dim)",
        borderRadius: 4,
        padding: "1px 7px",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5"
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--fg2)",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </div>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full"
      style={{
        background: "var(--bg3)",
        border: "1px solid var(--border)",
        borderRadius: 7,
        color: "var(--fg)",
        fontSize: 13,
        padding: "9px 12px",
        paddingRight: 32,
        outline: "none",
        cursor: "pointer",
        fontFamily: "var(--body)",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "calc(100% - 10px) center",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
