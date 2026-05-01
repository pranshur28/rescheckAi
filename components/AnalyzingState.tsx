"use client";

import { useEffect, useState } from "react";

const STEP_DELAYS_MS = [900, 1800, 2700, 3600];

export default function AnalyzingState() {
  const [activeStep, setActiveStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const steps = [
    "Uploading clip to analysis pipeline",
    "Pass 1 — classifying incident type",
    "Retrieving IFAB Laws of the Game",
    "Pass 2 — issuing rule-grounded verdict",
    "Validating citation & confidence",
  ];

  useEffect(() => {
    const timers = STEP_DELAYS_MS.map((ms, i) =>
      setTimeout(() => setActiveStep(i + 1), ms),
    );
    const ticker = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(ticker);
    };
  }, []);

  return (
    <div
      className="flex flex-col items-center px-6 py-12"
      style={{ animation: "fade-up 0.4s ease both" }}
    >
      <div className="relative mb-8 h-[130px] w-[200px]">
        <svg
          width="200"
          height="130"
          viewBox="0 0 200 130"
          className="absolute left-0 top-0"
        >
          <rect
            x="4"
            y="4"
            width="192"
            height="122"
            rx="6"
            fill="none"
            stroke="oklch(40% 0.015 250)"
            strokeWidth="1.5"
          />
          <line
            x1="100"
            y1="4"
            x2="100"
            y2="126"
            stroke="oklch(40% 0.015 250)"
            strokeWidth="1"
          />
          <circle
            cx="100"
            cy="65"
            r="20"
            fill="none"
            stroke="oklch(40% 0.015 250)"
            strokeWidth="1"
          />
          <circle cx="100" cy="65" r="2" fill="oklch(40% 0.015 250)" />
          <rect
            x="4"
            y="35"
            width="42"
            height="60"
            rx="2"
            fill="none"
            stroke="oklch(38% 0.015 250)"
            strokeWidth="1"
          />
          <rect
            x="154"
            y="35"
            width="42"
            height="60"
            rx="2"
            fill="none"
            stroke="oklch(38% 0.015 250)"
            strokeWidth="1"
          />
        </svg>

        <div
          className="absolute left-1 right-1 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--blue) 50%, transparent)",
            animation: "scan-line 2s ease-in-out infinite alternate",
            top: "50%",
            boxShadow: "0 0 8px var(--blue)",
          }}
        />

        <div
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            border: "2px solid var(--blue)",
            animation: "pulse-ring 2s ease-in-out infinite",
            opacity: 0.5,
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            border: "1px solid var(--blue)",
            animation: "pulse-ring 2s ease-in-out infinite 0.5s",
            opacity: 0.25,
          }}
        />

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-barlow"
          style={{
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: "0.12em",
            color: "var(--blue)",
            textShadow: "0 0 12px var(--blue)",
          }}
        >
          VAR
        </div>
      </div>

      <div
        className="mb-2 font-barlow uppercase"
        style={{
          fontWeight: 800,
          fontSize: 28,
          letterSpacing: "0.06em",
          color: "var(--fg)",
        }}
      >
        Reviewing the call
      </div>

      <div
        className="mb-8 flex items-center gap-1.5 font-mono"
        style={{ fontSize: 12, color: "var(--fg3)" }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: "var(--blue)",
            animation: "blink 1s step-start infinite",
          }}
        />
        {elapsed}s elapsed
      </div>

      <div className="flex w-full max-w-[380px] flex-col gap-2.5">
        {steps.map((label, i) => {
          const isDone = i < activeStep;
          const isActive = i === activeStep;
          return (
            <div
              key={i}
              className="flex items-center gap-3 transition-opacity duration-300"
              style={{
                opacity: i <= activeStep ? 1 : 0.28,
                animation:
                  i <= activeStep ? "step-in 0.3s ease both" : "none",
              }}
            >
              <div
                className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white transition-all duration-300"
                style={{
                  border: `1.5px solid ${
                    isDone
                      ? "var(--green)"
                      : isActive
                        ? "var(--blue)"
                        : "var(--border)"
                  }`,
                  background: isDone ? "var(--green)" : "transparent",
                }}
              >
                {isDone ? (
                  "✓"
                ) : isActive ? (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: "var(--blue)",
                      animation: "blink 0.8s step-start infinite",
                    }}
                  />
                ) : null}
              </div>
              <span
                className="text-[13px] transition-colors duration-300"
                style={{
                  color: isDone
                    ? "var(--fg2)"
                    : isActive
                      ? "var(--fg)"
                      : "var(--fg3)",
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
