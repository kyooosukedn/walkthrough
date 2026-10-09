import { describe, expect, it } from "vitest";
import { mapBounded } from "./ordered-map.js";

describe("mapBounded", () => {
  it("limits active work and returns results in input order", async () => {
    let active = 0;
    let highest = 0;
    const result = await mapBounded([30, 5, 20, 1, 10], 2, async (delay, index) => {
      active++;
      highest = Math.max(highest, active);
      await new Promise((done) => setTimeout(done, delay));
      active--;
      return index;
    });
    expect(highest).toBe(2);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles empty input without calling the mapper", async () => {
    let called = false;
    expect(await mapBounded([], 16, async () => { called = true; return 1; })).toEqual([]);
    expect(called).toBe(false);
  });
});
