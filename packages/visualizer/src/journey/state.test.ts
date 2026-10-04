import { describe, expect, it } from "vitest";
import { followJourney, jumpJourney, startJourney } from "./state.js";

describe("file-led journey", () => {
  it("starts at the file selected from the repo overview", () => {
    expect(startJourney("src/app.ts", 12)).toEqual({
      steps: [{ path: "src/app.ts", line: 12 }],
      activeIndex: 0,
    });
  });

  it("follows a recommended file and keeps the reason", () => {
    const journey = followJourney(startJourney("src/app.ts"), {
      path: "src/service.ts", line: 24, reason: "Handles the request",
    });
    expect(journey).toEqual({
      steps: [
        { path: "src/app.ts" },
        { path: "src/service.ts", line: 24, reason: "Handles the request" },
      ],
      activeIndex: 1,
    });
  });

  it("moves within the current file without adding another step", () => {
    const journey = followJourney(startJourney("src/app.ts"), { path: "src/app.ts", line: 9, reason: "Source citation" });
    expect(journey).toEqual({ steps: [{ path: "src/app.ts", line: 9 }], activeIndex: 0 });
  });

  it("can jump back and branch to a different next file", () => {
    let journey = startJourney("src/app.ts");
    journey = followJourney(journey, { path: "src/service.ts", reason: "Service" });
    journey = followJourney(journey, { path: "src/model.ts", reason: "Model" });
    journey = jumpJourney(journey, 0);
    expect(journey.activeIndex).toBe(0);
    journey = followJourney(journey, { path: "src/routes.ts", reason: "Alternative route" });
    expect(journey.steps.map((step) => step.path)).toEqual(["src/app.ts", "src/routes.ts"]);
    expect(journey.activeIndex).toBe(1);
  });

  it("ignores an invalid jump", () => {
    const journey = startJourney("src/app.ts");
    expect(jumpJourney(journey, -1)).toBe(journey);
    expect(jumpJourney(journey, 1)).toBe(journey);
  });
});
