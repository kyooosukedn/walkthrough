import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import type { TourEngine, TourState } from "./TourEngine.js";

interface NarrationPanelProps {
  engine: TourEngine;
  state: TourState;
}

export function NarrationPanel({ engine, state }: NarrationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { currentStep, currentIndex, steps } = state;

  if (!currentStep) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(26, 26, 37, 0.9)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border)",
        transition: "transform 300ms ease",
        zIndex: 5,
      }}
    >
      {/* Header bar */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          cursor: "pointer",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Step {currentIndex + 1} of {steps.length}: {currentStep.title}
        </span>
        {collapsed ? (
          <ChevronUp size={14} color="var(--text-muted)" />
        ) : (
          <ChevronDown size={14} color="var(--text-muted)" />
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ padding: "12px 16px 16px" }}>
          {/* Only the narration scrolls, so Previous/Next stay visible */}
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--text)",
              lineHeight: 1.6,
              maxHeight: 170,
              overflowY: "auto",
            }}
          >
            {renderDescription(currentStep.description)}
          </div>

          {/* Code snippet */}
          {currentStep.codeSnippet && (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                background: "var(--bg-deep)",
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text)",
                overflow: "auto",
                border: "1px solid var(--border)",
              }}
            >
              {currentStep.codeSnippet.content}
            </pre>
          )}

          {/* Navigation */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 12,
            }}
          >
            <button
              onClick={() => engine.previous()}
              disabled={isFirst}
              style={{
                ...navBtnStyle,
                opacity: isFirst ? 0.3 : 1,
              }}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={() => engine.next()}
              style={{
                ...navBtnStyle,
                background: "var(--accent-primary)",
                color: "#fff",
              }}
            >
              {isLast ? "Finish" : "Next"}{" "}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  background: "var(--bg-hover)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 150ms ease",
};

/** Simple markdown: paragraphs, "- " bullet lists, bold and inline code */
function renderDescription(text: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={blocks.length} style={{ margin: "6px 0", paddingLeft: 20, display: "grid", gap: 2 }}>
        {list.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else {
      flushList();
      if (line.trim()) blocks.push(<p key={blocks.length} style={{ margin: "4px 0" }}>{renderInline(line)}</p>);
    }
  }
  flushList();
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "var(--bg-hover)",
            padding: "1px 4px",
            borderRadius: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
