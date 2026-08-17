import { useState, useCallback, useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { CodeMapProvider, useCodeMap } from "./data/context.js";
import { Layout } from "./ui/Layout.js";
import { TopBar } from "./ui/TopBar.js";
import { Sidebar } from "./ui/Sidebar.js";
import { WelcomeScreen } from "./ui/WelcomeScreen.js";
import { TourSidebar } from "./tour/TourSidebar.js";
import { NarrationPanel } from "./tour/NarrationPanel.js";
import { TourEngine, type TourState } from "./tour/TourEngine.js";
import { SystemOverview } from "./views/SystemOverview.js";

type AppMode = "welcome" | "tour" | "explore";

export function App() {
  return (
    <CodeMapProvider>
      <AppContent />
    </CodeMapProvider>
  );
}

function AppContent() {
  const { data, loading, error } = useCodeMap();
  const [mode, setMode] = useState<AppMode>("welcome");
  const [activeView, setActiveView] = useState("overview");
  const [tourEngine, setTourEngine] = useState<TourEngine | null>(null);
  const [tourState, setTourState] = useState<TourState | null>(null);

  const handleStartTour = useCallback(() => {
    if (!data?.tour) return;
    const engine = new TourEngine(data.tour);

    engine.on("stepChange", (state) => setTourState(state));
    engine.on("play", (state) => setTourState(state));
    engine.on("stop", () => {
      setTourState(null);
      setTourEngine(null);
      setMode("explore");
    });
    engine.on("complete", () => {
      setTourState(null);
      setTourEngine(null);
      setMode("explore");
    });

    setTourEngine(engine);
    engine.start();
    setMode("tour");
  }, [data]);

  const handleExplore = useCallback(() => {
    setMode("explore");
  }, []);

  const handleStopTour = useCallback(() => {
    tourEngine?.stop();
    setTourEngine(null);
    setTourState(null);
    setMode("explore");
  }, [tourEngine]);

  // Loading state
  if (loading) {
    return (
      <div style={fullScreenStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <span style={{ color: "var(--accent-primary)", fontSize: 36, animation: "breathe 4s ease-in-out infinite" }}>◆</span>
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 16 }}>
            Mapping your architecture...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ ...fullScreenStyle, flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--accent-route)", fontSize: 16 }}>Failed to load codemap.json</span>
        <span style={{ color: "var(--text-dim)", fontSize: 13, fontFamily: "var(--font-mono)" }}>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  // Welcome screen
  if (mode === "welcome") {
    return (
      <WelcomeScreen
        meta={data.meta}
        onStartTour={handleStartTour}
        onExplore={handleExplore}
        hasTour={!!data.tour && data.tour.steps.length > 0}
      />
    );
  }

  // Tour or Explore mode
  const isTourActive = mode === "tour" && tourEngine !== null && tourState !== null;

  const sidebar = isTourActive ? (
    <TourSidebar engine={tourEngine} state={tourState} />
  ) : (
    <Sidebar />
  );

  return (
    <Layout
      topBar={
        <TopBar
          activeView={activeView}
          onViewChange={setActiveView}
          isTourActive={isTourActive}
          onStartTour={handleStartTour}
          onStopTour={handleStopTour}
          hasTour={!!data.tour && data.tour.steps.length > 0}
          meta={data.meta}
        />
      }
      sidebar={sidebar}
    >
      <ReactFlowProvider>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <SystemOverview
            tourState={isTourActive ? tourState : null}
          />
          {isTourActive && (
            <NarrationPanel engine={tourEngine!} state={tourState!} />
          )}
        </div>
      </ReactFlowProvider>
    </Layout>
  );
}

const fullScreenStyle: React.CSSProperties = {
  width: "100vw",
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-deep)",
  color: "var(--text-muted)",
  fontFamily: "var(--font-body)",
};
