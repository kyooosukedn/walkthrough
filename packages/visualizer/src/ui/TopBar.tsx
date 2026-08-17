import { Search, Sliders, Play, X } from "lucide-react";

interface TopBarProps {
  activeView?: string;
  onViewChange?: (view: string) => void;
  isTourActive?: boolean;
  onStartTour?: () => void;
  onStopTour?: () => void;
  hasTour?: boolean;
  meta?: { name: string; frameworks: Array<{ name: string }> };
}

const VIEW_TABS = [
  { id: "overview", label: "Overview" },
  { id: "routes", label: "Routes" },
  { id: "flow", label: "Data Flow" },
  { id: "database", label: "Database" },
];

export function TopBar({
  activeView = "overview",
  onViewChange,
  isTourActive = false,
  onStartTour,
  onStopTour,
  hasTour = false,
  meta,
}: TopBarProps) {
  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        gap: 8,
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
        <span style={{ color: "var(--accent-primary)", fontSize: 18 }}>◆</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
          }}
        >
          Walkthrough
        </span>
        {meta && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-dim)",
              marginLeft: 4,
            }}
          >
            {meta.name}
          </span>
        )}
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 24, background: "var(--border)" }} />

      {/* View tabs */}
      <div style={{ display: "flex", gap: 2 }}>
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onViewChange?.(tab.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background:
                activeView === tab.id ? "var(--accent-primary)" : "transparent",
              color:
                activeView === tab.id
                  ? "#fff"
                  : "var(--text-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 150ms ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Tour button */}
      {hasTour && !isTourActive && onStartTour && (
        <button
          onClick={onStartTour}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid var(--accent-secondary)",
            background: "transparent",
            color: "var(--accent-secondary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
        >
          <Play size={14} /> Tour
        </button>
      )}

      {isTourActive && onStopTour && (
        <button
          onClick={onStopTour}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid var(--accent-route)",
            background: "transparent",
            color: "var(--accent-route)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
        >
          <X size={14} /> End Tour
        </button>
      )}

      {/* Actions */}
      <button style={iconBtnStyle}>
        <Search size={16} />
      </button>
      <button style={iconBtnStyle}>
        <Sliders size={16} />
      </button>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "all 150ms ease",
};
