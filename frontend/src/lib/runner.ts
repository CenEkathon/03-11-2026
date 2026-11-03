/**
 * Pure rules for "Subway Dash", the hidden easter-egg runner. It is an original endless runner in the same
 * spirit as Subway Surfers (three lanes, jump barriers, dodge trains, collect coins). No assets are copied.
 * Nothing here renders; the component draws the state. Randomness is seeded so runs are deterministic and testable.
 */

export const LANE_COUNT = 3;
export type Lane = 0 | 1 | 2;
export type Action = "left" | "right" | "jump";
export type ObstacleKind = "train" | "barrier";

export interface Obstacle {
  id: number;
  lane: Lane;
  /** Distance ahead of the runner. 0 is the runner, larger is further away. */
  z: number;
  kind: ObstacleKind;
}

export interface Coin {
  id: number;
  lane: Lane;
  z: number;
}

export interface RunnerState {
  status: "ready" | "running" | "crashed";
  lane: Lane;
  /** Seconds of jump left. Greater than 0 means airborne. */
  jumpLeft: number;
  distance: number;
  collected: number;
  speed: number;
  obstacles: Obstacle[];
  coins: Coin[];
  /** Distance left until the next wave spawns. */
  spawnIn: number;
  seed: number;
  nextId: number;
}

export const JUMP_SECONDS = 0.6;
/** An object with |z| within this window overlaps the runner. */
export const HIT_WINDOW = 1.2;
export const SPAWN_Z = 45;
export const START_SPEED = 14;
export const MAX_SPEED = 30;
const CULL_Z = -HIT_WINDOW - 1;
const FIRST_WAVE_DELAY = 30;

export function createRunner(seed = 1): RunnerState {
  return {
    status: "ready",
    lane: 1,
    jumpLeft: 0,
    distance: 0,
    collected: 0,
    speed: START_SPEED,
    obstacles: [],
    coins: [],
    spawnIn: FIRST_WAVE_DELAY,
    seed,
    nextId: 1,
  };
}

/** Starts a fresh run. The seed changes so each run has a different track. */
export function startRunner(previous: RunnerState): RunnerState {
  return { ...createRunner(previous.seed + 7919), status: "running" };
}

/** Score: half a point per unit of distance, plus 10 per coin. */
export function scoreOf(s: RunnerState): number {
  return Math.floor(s.distance / 2) + s.collected * 10;
}

/** Mulberry32 as a pure function: returns a value in [0, 1) and the next seed. */
function random(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

/**
 * Advances the run by `dt` seconds. Actions are applied first, then the world moves, then collisions are
 * checked. Each wave holds at most one obstacle, so at least two lanes are always clear.
 */
export function step(s: RunnerState, actions: readonly Action[], dt: number): RunnerState {
  if (s.status !== "running") return s;

  let lane = s.lane;
  let jumpLeft = Math.max(0, s.jumpLeft - dt);
  for (const action of actions) {
    if (action === "left" && lane > 0) lane = (lane - 1) as Lane;
    else if (action === "right" && lane < LANE_COUNT - 1) lane = (lane + 1) as Lane;
    else if (action === "jump" && jumpLeft === 0) jumpLeft = JUMP_SECONDS;
  }

  const advance = s.speed * dt;
  const distance = s.distance + advance;
  const speed = Math.min(MAX_SPEED, START_SPEED + distance / 100);

  const obstacles = s.obstacles.map((o) => ({ ...o, z: o.z - advance })).filter((o) => o.z > CULL_Z);
  let crashed = false;
  for (const o of obstacles) {
    if (o.lane !== lane || Math.abs(o.z) > HIT_WINDOW) continue;
    // Trains must be left behind by changing lane. Barriers can be cleared by jumping.
    if (o.kind === "train" || jumpLeft === 0) crashed = true;
  }

  let collected = s.collected;
  const coins = s.coins
    .map((c) => ({ ...c, z: c.z - advance }))
    .filter((c) => c.z > CULL_Z)
    .filter((c) => {
      if (c.lane === lane && Math.abs(c.z) <= HIT_WINDOW) {
        collected += 1;
        return false;
      }
      return true;
    });

  let seed = s.seed;
  let nextId = s.nextId;
  let spawnIn = s.spawnIn - advance;
  const newObstacles: Obstacle[] = [];
  const newCoins: Coin[] = [];
  while (spawnIn <= 0) {
    const gap = Math.max(16, 26 - (speed - START_SPEED) * 0.6);
    const z0 = SPAWN_Z + spawnIn;

    const laneRoll = random(seed);
    seed = laneRoll.seed;
    const obstacleLane = Math.floor(laneRoll.value * LANE_COUNT) as Lane;

    const kindRoll = random(seed);
    seed = kindRoll.seed;
    const kind: ObstacleKind = kindRoll.value < 0.5 ? "train" : "barrier";
    newObstacles.push({ id: nextId++, lane: obstacleLane, z: z0, kind });

    for (let otherLane = 0; otherLane < LANE_COUNT; otherLane++) {
      if (otherLane === obstacleLane) continue;
      const coinRoll = random(seed);
      seed = coinRoll.seed;
      if (coinRoll.value < 0.6) {
        for (let i = 0; i < 3; i++) {
          newCoins.push({ id: nextId++, lane: otherLane as Lane, z: z0 - i * 2.5 });
        }
      }
    }
    spawnIn += gap;
  }

  return {
    status: crashed ? "crashed" : "running",
    lane,
    jumpLeft,
    distance,
    collected,
    speed,
    obstacles: [...obstacles, ...newObstacles],
    coins: [...coins, ...newCoins],
    spawnIn,
    seed,
    nextId,
  };
}
