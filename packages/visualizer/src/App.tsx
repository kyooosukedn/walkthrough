import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { CodeMapProvider, useCodeMap } from "./data/context.js";
import { Layout } from "./ui/Layout.js";
import { TopBar } from "./ui/TopBar.js";
import { Sidebar } from "./ui/Sidebar.js";
import { WelcomeScreen } from "./ui/WelcomeScreen.js";
import { SourcePreview } from "./ui/SourcePreview.js";
import { TourSidebar } from "./tour/TourSidebar.js";
import { NarrationPanel } from "./tour/NarrationPanel.js";
import { TourEngine, type TourState } from "./tour/TourEngine.js";
import { followJourney, jumpJourney, startJourney, type Journey } from "./journey/state.js";
import type { FileExplanation } from "./explain/FileExplanationPanel.js";
import { ActivityPanel } from "./activity/ActivityPanel.js";

// Graph views pull heavy deps (React Flow, elkjs, framer-motion) — the
// welcome screen ships without them, so first paint stays small.
const SystemOverview = lazy(() => import("./views/SystemOverview.js").then((m) => ({ default: m.SystemOverview })));
const RouteMap = lazy(() => import("./views/RouteMap.js").then((m) => ({ default: m.RouteMap })));
const ComponentTree = lazy(() => import("./views/ComponentTree.js").then((m) => ({ default: m.ComponentTree })));
const DatabaseSchemaView = lazy(() => import("./views/DatabaseSchemaView.js").then((m) => ({ default: m.DatabaseSchemaView })));

type AppMode = "welcome" | "tour" | "explore" | "source" | "activity";

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
  const [sourceReturnMode, setSourceReturnMode] = useState<"welcome" | "activity">("welcome");
  const [activeView, setActiveView] = useState("overview");
  const [tourEngine, setTourEngine] = useState<TourEngine | null>(null);
  const [tourState, setTourState] = useState<TourState | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [explanations, setExplanations] = useState<Record<string, FileExplanation>>({});
  const [activityAvailable, setActivityAvailable] = useState(false);
  useEffect(() => {
    fetch("/activity/config").then((response) => response.ok ? response.json() : null)
      .then((config: { enabled?: boolean } | null) => setActivityAvailable(config?.enabled === true))
      .catch(() => {});
  }, []);
  const openSource = useCallback((path: string, line?: number) => {
    setSourceReturnMode(mode === "activity" ? "activity" : "welcome");
    setJourney(startJourney(path, line));
    setMode("source");
  }, [mode]);
  const followSource = useCallback((path: string, line?: number, reason?: string) => {
    setJourney((current) => current
      ? followJourney(current, { path, line, reason })
      : startJourney(path, line));
    setMode("source");
  }, []);
  const openCitation = useCallback((path: string, line?: number) => {
    followSource(path, line, "Source citation");
  }, [followSource]);
  const returnToOverview = useCallback(() => {
    setJourney(null);
    setMode(sourceReturnMode);
  }, [sourceReturnMode]);
  const saveExplanation = useCallback((path: string, explanation: FileExplanation) => {
    setExplanations((current) => ({ ...current, [path]: explanation }));
  }, []);

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

  if (mode === "source" && journey) {
    const step = journey.steps[journey.activeIndex];
    return <SourcePreview
      key={step.path}
      path={step.path}
      line={step.line}
      journey={journey}
      cachedExplanation={explanations[step.path] ?? null}
      onBack={returnToOverview}
      backLabel={sourceReturnMode === "activity" ? "← Agent activity" : "← Repo overview"}
      onOpenSource={openCitation}
      onFollowNext={followSource}
      onJump={(index) => setJourney((current) => current ? jumpJourney(current, index) : current)}
      onExplanation={saveExplanation}
    />;
  }

  if (mode === "activity" && activityAvailable) {
    return <div style={{ minHeight: "100vh", background: "var(--bg-deep)" }}>
      <button type="button" onClick={returnToOverview} style={{ margin: 20, padding: "8px 12px" }}>← Repo start</button>
      <ActivityPanel onOpenSource={openSource} />
    </div>;
  }

  // Welcome screen
  if (mode === "welcome") {
    return (
      <WelcomeScreen
        data={data}
        onStartTour={handleStartTour}
        onExplore={handleExplore}
        onOpenSource={openSource}
        hasTour={!!data.tour && data.tour.steps.length > 0}
        onOpenActivity={activityAvailable ? () => setMode("activity") : undefined}
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
          onOpenActivity={activityAvailable ? () => setMode("activity") : undefined}
        />
      }
      sidebar={sidebar}
    >
      <ReactFlowProvider>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <Suspense fallback={<div style={{ ...fullScreenStyle, color: "var(--text-muted)" }}>Loading view…</div>}>
            {activeView === "routes" ? (
              <RouteMap />
            ) : activeView === "components" ? (
              <ComponentTree />
            ) : activeView === "database" ? (
              <DatabaseSchemaView />
            ) : (
              <SystemOverview
                tourState={isTourActive ? tourState : null}
              />
            )}
          </Suspense>
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
