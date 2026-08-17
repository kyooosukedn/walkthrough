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
  const { fitView, setViewport, setNodes } = useReactFlow();
  const prevStateRef = useRef<string>("");

  useEffect(() => {
    if (!state) return;

    if (state.isPlaying && state.currentStep) {
      const stepKey = `${state.currentIndex}-${state.currentStep.id}`;
      if (stepKey === prevStateRef.current) return;
      prevStateRef.current = stepKey;

      const { focusNodeIds, cameraPosition } = state.currentStep;

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
        });
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
  }, [state, fitView, setViewport, setNodes]);
}
