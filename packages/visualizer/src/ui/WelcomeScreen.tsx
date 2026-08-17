import { Play, Compass } from "lucide-react";
import type { CodeMapMeta } from "../types.js";

interface WelcomeScreenProps {
  meta: CodeMapMeta;
  onStartTour: () => void;
  onExplore: () => void;
  hasTour: boolean;
}

export function WelcomeScreen({ meta, onStartTour, onExplore, hasTour }: WelcomeScreenProps) {
  const { stats, name } = meta;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-deep)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.5,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          animation: "fadeInUp 800ms ease-out",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              color: "var(--accent-primary)",
              fontSize: 36,
              animation: "breathe 4s ease-in-out infinite",
            }}
          >
            ◆
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 36,
              color: "var(--text)",
            }}
          >
            Walkthrough
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 18,
            color: "var(--text-muted)",
            textAlign: "center",
            maxWidth: 400,
            marginTop: 8,
          }}
        >
          Understand any codebase in 5 minutes.
        </div>

        {/* Project name */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: "var(--accent-secondary)",
            marginTop: 4,
          }}
        >
          {name}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          {hasTour && (
            <button onClick={onStartTour} style={primaryBtnStyle}>
              <Play size={16} /> Start Guided Tour
            </button>
          )}
          <button
            onClick={onExplore}
            style={hasTour ? secondaryBtnStyle : primaryBtnStyle}
          >
            <Compass size={16} /> Explore Freely
          </button>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 24,
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-dim)",
          }}
        >
          <span>{stats.files} files</span>
          <span>·</span>
          <span>{stats.directories} directories</span>
          <span>·</span>
          <span>{meta.frameworks.map((f) => f.name).join(", ") || "unknown framework"}</span>
        </div>
      </div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 24px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent-primary)",
  color: "#fff",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 150ms ease, box-shadow 150ms ease",
  boxShadow: "0 0 20px var(--accent-glow)",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 24px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 150ms ease",
};
