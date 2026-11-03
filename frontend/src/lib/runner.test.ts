import { describe, expect, it } from "vitest";
import { createRunner, JUMP_SECONDS, scoreOf, startRunner, step, type RunnerState } from "./runner";

/** A running run with the first wave pushed far away, so tests control every object. */
function running(overrides: Partial<RunnerState> = {}): RunnerState {
  return { ...createRunner(3), status: "running", spawnIn: 1000, ...overrides };
}

describe("step", () => {
  it("does nothing until the run is started", () => {
    const ready = createRunner(3);
    expect(step(ready, ["left"], 0.1)).toBe(ready);
  });

  it("clamps lane changes to the track", () => {
    let s = running();
    s = step(s, ["left", "left", "left"], 0.01);
    expect(s.lane).toBe(0);
    s = step(s, ["right", "right", "right", "right"], 0.01);
    expect(s.lane).toBe(2);
  });

  it("starts a jump that ends after JUMP_SECONDS", () => {
    let s = step(running(), ["jump"], 0.1);
    // The jump starts at full length on the frame it is pressed.
    expect(s.jumpLeft).toBeCloseTo(JUMP_SECONDS, 6);
    for (let i = 0; i < 20; i++) s = step(s, [], 0.05);
    expect(s.jumpLeft).toBe(0);
  });

  it("crashes into a train in the runner's lane", () => {
    const s = running({ obstacles: [{ id: 1, lane: 1, z: 0.5, kind: "train" }] });
    expect(step(s, [], 0.01).status).toBe("crashed");
  });

  it("crashes into a train even while jumping", () => {
    const s = running({ jumpLeft: 0.5, obstacles: [{ id: 1, lane: 1, z: 0.5, kind: "train" }] });
    expect(step(s, [], 0.01).status).toBe("crashed");
  });

  it("lets the runner pass a train by changing lane", () => {
    const s = running({ obstacles: [{ id: 1, lane: 1, z: 0.5, kind: "train" }] });
    expect(step(s, ["right"], 0.01).status).toBe("running");
  });

  it("crashes into a barrier on the ground but not mid-jump", () => {
    const barrier = { id: 1, lane: 1 as const, z: 0.5, kind: "barrier" as const };
    expect(step(running({ obstacles: [barrier] }), [], 0.01).status).toBe("crashed");
    expect(step(running({ jumpLeft: 0.5, obstacles: [barrier] }), [], 0.01).status).toBe("running");
  });

  it("collects a coin in the runner's lane and not in others", () => {
    const coin = { id: 2, lane: 0 as const, z: 0.5 };
    expect(step(running({ coins: [coin] }), [], 0.01).collected).toBe(0);
    expect(step(running({ coins: [coin] }), ["left"], 0.01).collected).toBe(1);
  });

  it("is deterministic for the same seed and the same inputs", () => {
    const run = () => {
      let s = startRunner(createRunner(42));
      for (let i = 0; i < 400 && s.status === "running"; i++) {
        s = step(s, i % 50 === 0 ? ["jump"] : i % 70 === 0 ? ["left"] : [], 1 / 60);
      }
      return s;
    };
    expect(run()).toEqual(run());
  });

  it("keeps waves apart, so two obstacles never share a depth and at least two lanes stay clear", () => {
    let s = startRunner(createRunner(7));
    for (let i = 0; i < 3000; i++) {
      s = step(s, [], 1 / 60);
      // Revive after a crash so the check covers the whole track, not just the first collision.
      if (s.status === "crashed") s = { ...s, status: "running" };
      const zs = s.obstacles.map((o) => o.z).sort((a, b) => a - b);
      for (let j = 1; j < zs.length; j++) {
        // Waves are at least 16 units apart, so neighbours in depth are never in the same wave.
        expect(zs[j] - zs[j - 1]).toBeGreaterThanOrEqual(10);
      }
    }
  });
});

describe("scoreOf", () => {
  it("adds 10 per coin on top of distance", () => {
    expect(scoreOf({ ...createRunner(1), distance: 100, collected: 3 })).toBe(50 + 30);
  });
});
