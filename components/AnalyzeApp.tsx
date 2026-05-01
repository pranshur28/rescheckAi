"use client";

// Single client component that owns the upload + form state and renders the
// VerdictCard once /api/analyze returns.

import { useState } from "react";
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

type AnalyzeStatus = "idle" | "submitting" | "succeeded" | "failed";

const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

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

  const cloudinaryConfigured = Boolean(UPLOAD_PRESET && CLOUD_NAME);

  function loadPreset(presetId: string) {
    const preset = DEMO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setClipUrl(preset.cloudinaryUrl);
    setOriginalDecision(preset.originalDecision);
    setIncidentType(preset.incidentType);
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
    } catch (err) {
      setStatus("failed");
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">RefCheck AI</h1>
        <p className="mt-3 text-base text-neutral-500">
          Rule-grounded second-review for soccer referee decisions. Upload a
          clip, get an IFAB-cited verdict in under 30 seconds.
        </p>
      </header>

      {/* Demo presets */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Try a demo preset
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DEMO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => loadPreset(preset.id)}
              className="rounded-lg border border-neutral-300 px-4 py-3 text-left text-sm hover:border-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-900"
            >
              <div className="font-medium">{preset.label}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {preset.presenterNote}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Upload */}
      <section className="mb-6 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          1. Upload a soccer clip
        </h2>

        {!cloudinaryConfigured ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            Cloudinary not configured. Set{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40">
              NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
            </code>{" "}
            and{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40">
              NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
            </code>
            . Demo presets still work without upload.
          </p>
        ) : (
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
                if (info.secure_url) setClipUrl(info.secure_url);
              }
            }}
          >
            {({ open }) => (
              <button
                type="button"
                onClick={() => open()}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {clipUrl ? "Upload a different clip" : "Choose a clip"}
              </button>
            )}
          </CldUploadWidget>
        )}

        {clipUrl ? (
          <div className="mt-4">
            <video
              key={clipUrl}
              src={clipUrl}
              controls
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800"
            />
            <p className="mt-2 break-all text-xs text-neutral-500">
              {clipUrl}
            </p>
          </div>
        ) : null}
      </section>

      {/* Decision form */}
      <section className="mb-6 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
          2. Tell us about the call
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Original referee decision
            </span>
            <select
              value={originalDecision}
              onChange={(e) =>
                setOriginalDecision(e.target.value as OriginalRefereeDecision)
              }
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {ORIGINAL_DECISION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Incident type</span>
            <select
              value={incidentType}
              onChange={(e) =>
                setIncidentType(
                  e.target.value as IncidentType | "auto_detect",
                )
              }
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {INCIDENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {originalDecision === "unknown" ? (
          <p className="mt-3 rounded-md bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            Without the original decision, RefCheck switches to{" "}
            <strong>rule assessment mode</strong> and won&apos;t say the call
            was right or wrong — only what the rule says.
          </p>
        ) : null}
      </section>

      {/* Submit */}
      <section className="mb-8">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={status === "submitting" || !clipUrl}
          className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
        >
          {status === "submitting" ? "Analyzing…" : "Analyze clip"}
        </button>
        {error ? (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </section>

      {result ? <VerdictCard response={result} /> : null}
    </main>
  );
}
