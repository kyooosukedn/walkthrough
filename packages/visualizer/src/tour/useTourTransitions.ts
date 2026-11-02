import { useCallback, useEffect, useRef } from "react";
import {
  useReactFlow,
} from "@xyflow/react";
import type { TourState } from "./TourEngine.js";

/**
 * Hook that handles tour transitions:
 * - Smooth camera pan/zoom to focused nodes
 * - Highlight/dim nodes based on tour step
 */
export function useTourTransitions(state: TourState | null) {
  const { fitView, setViewport, setNodes, getNodes } = useReactFlow();
  const prevStateRef = useRef<string>("");

  useEffect(() => {
    if (!state) return;

    if (state.isPlaying && state.currentStep) {
      const stepKey = `${state.currentIndex}-${state.currentStep.id}`;
      if (stepKey === prevStateRef.current) return;
      prevStateRef.current = stepKey;

      const { cameraPosition } = state.currentStep;
      // A step may point at nodes deeper than this view draws (e.g.
      // backend/app/api); highlight the nearest ancestor that is on screen.
      const focusNodeIds = resolveFocus(state.currentStep.focusNodeIds, new Set(getNodes().map((n) => n.id)));

      // Camera movement
      if (cameraPosition) {
        setViewport(
          { x: cameraPosition.x, y: cameraPosition.y, zoom: cameraPosition.zoom },
          { duration: 600 },
        );
      } else if (focusNodeIds.length > 0) {
        fitView({
          nodes: focusNodeIds.map((id) => ({ id })),
          duration: 600,
          padding: 0.3,
          maxZoom: 1.2,
        });
      } else {
        fitView({ duration: 600, padding: 0.1 });
      }

      // Dim non-relevant nodes, highlight focused ones
      setNodes((nodes) =>
        nodes.map((node) => {
          const isFocused = focusNodeIds.includes(node.id);
          return {
            ...node,
            style: {
              ...node.style,
              opacity: isFocused ? 1 : 0.2,
              transition: "opacity 300ms ease",
            },
          };
        }),
      );
    } else if (!state.isPlaying && state.currentIndex === -1) {
      // Tour stopped — restore all nodes
      prevStateRef.current = "";
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          style: {
            ...node.style,
            opacity: 1,
            transition: "opacity 300ms ease",
          },
        })),
      );
      fitView({ duration: 400 });
    }
  }, [state, fitView, setViewport, setNodes, getNodes]);
}

/** Map each focus id to itself or its nearest ancestor path present in the graph. */
export function resolveFocus(ids: string[], present: Set<string>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    let path = id;
    while (path && !present.has(path)) {
      path = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    }
    if (path) out.add(path);
  }
  return [...out];
}
