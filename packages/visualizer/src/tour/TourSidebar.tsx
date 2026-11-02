import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { TourEngine, TourState } from "./TourEngine.js";

interface TourSidebarProps {
  engine: TourEngine;
  state: TourState;
}

export function TourSidebar({ engine, state }: TourSidebarProps) {
  const { steps, currentIndex } = state;
  const activeRef = useRef<HTMLDivElement>(null);

  // Scroll active step into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

  return (
    <div
      style={{
        width: 280,
        background: "var(--bg-elevated)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent-secondary)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Guided Tour · Step {currentIndex + 1} of {steps.length}
        </span>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {steps.map((step, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;

          return (
            <div
              key={step.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => engine.goTo(i)}
              style={{
                padding: "10px 16px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
                background: isActive ? "var(--accent-glow)" : "transparent",
                borderLeft: isActive
                  ? "3px solid var(--accent-primary)"
                  : "3px solid transparent",
                opacity: isDone ? 0.5 : 1,
                transition: "all 150ms ease",
              }}
            >
              {/* Step number / check */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  background: isDone
                    ? "var(--accent-secondary)"
                    : isActive
                      ? "var(--accent-primary)"
                      : "var(--border)",
                  color: isDone || isActive ? "#fff" : "var(--text-muted)",
                }}
              >
                {isDone ? <Check size={12} /> : i + 1}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginTop: 2,
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {plainText(step.description)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Strip the light markdown used in narration for one-line previews. */
function plainText(md: string): string {
  return md
    .replace(/\*\*|`/g, "")
    .replace(/\n+- /g, " · ")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}
