import { useEffect, useRef } from "react";
import { JUMP_SECONDS, createRunner, scoreOf, startRunner, step, type Action, type RunnerState } from "../lib/runner";

// Canvas geometry. The track is drawn in perspective: a distance z maps to a scale k = 1 / (1 + z / VIEW_DIST).
const W = 480;
const H = 360;
const HORIZON = 110;
const NEAR_Y = 330;
const CENTER_X = W / 2;
const ROAD_HALF = 190;
const LANE_STEP = 127;
const VIEW_DIST = 14;
const MAX_QUEUED_INPUTS = 8;

const KEY_ACTIONS: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
};

function project(z: number, lane: number) {
  const k = 1 / (1 + Math.max(z, 0) / VIEW_DIST);
  return { x: CENTER_X + (lane - 1) * LANE_STEP * k, y: HORIZON + (NEAR_Y - HORIZON) * k, k };
}

function drawTrack(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, "#7dd3fc");
  sky.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);

  ctx.fillStyle = "#86efac";
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  ctx.fillStyle = "#374151";
  ctx.beginPath();
  ctx.moveTo(CENTER_X, HORIZON);
  ctx.lineTo(CENTER_X + ROAD_HALF, NEAR_Y);
  ctx.lineTo(CENTER_X - ROAD_HALF, NEAR_Y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  for (const offset of [-LANE_STEP / 2, LANE_STEP / 2]) {
    ctx.beginPath();
    ctx.moveTo(CENTER_X, HORIZON);
    ctx.lineTo(CENTER_X + offset, NEAR_Y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawTrain(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  const w = 120 * k;
  const h = 110 * k;
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = "#fecaca";
  ctx.fillRect(x - w / 2 + w * 0.1, y - h + h * 0.15, w * 0.8, h * 0.25);
}

function drawBarrier(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  const w = 110 * k;
  const h = 34 * k;
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x - w / 2, y - h * 0.55, w, h * 0.18);
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  ctx.beginPath();
  ctx.arc(x, y - 30 * k, 10 * k, 0, Math.PI * 2);
  ctx.fillStyle = "#facc15";
  ctx.fill();
  ctx.strokeStyle = "#a16207";
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.stroke();
}

function drawRunner(ctx: CanvasRenderingContext2D, s: RunnerState) {
  const { x } = project(0, s.lane);
  const airborne = s.jumpLeft > 0 ? Math.sin(Math.PI * (1 - s.jumpLeft / JUMP_SECONDS)) * 110 : 0;
  const base = NEAR_Y - airborne;

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, NEAR_Y, 28 - airborne * 0.15, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const body = s.status === "crashed" ? "#6b7280" : "#2563eb";
  ctx.fillStyle = body;
  ctx.fillRect(x - 22, base - 80, 44, 60);
  ctx.fillRect(x - 20, base - 22, 16, 22);
  ctx.fillRect(x + 4, base - 22, 16, 22);
  ctx.beginPath();
  ctx.arc(x, base - 92, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#fde68a";
  ctx.fill();
}

function drawHud(ctx: CanvasRenderingContext2D, s: RunnerState, best: number) {
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#111827";
  ctx.fillText(`Score ${scoreOf(s)}`, 14, 26);
  ctx.textAlign = "right";
  ctx.fillText(`Best ${best}`, W - 14, 26);

  if (s.status === "running") return;
  ctx.fillStyle = "rgba(17,24,39,0.55)";
  ctx.fillRect(0, H / 2 - 56, W, 112);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px system-ui, sans-serif";
  if (s.status === "ready") {
    ctx.fillText("SUBWAY DASH", W / 2, H / 2 - 12);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText("Enter to start · ← → change lane · ↑ or Space to jump", W / 2, H / 2 + 20);
  } else {
    ctx.fillText(`Crashed! Score ${scoreOf(s)}`, W / 2, H / 2 - 12);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText("Enter to run again", W / 2, H / 2 + 20);
  }
}

function draw(ctx: CanvasRenderingContext2D, s: RunnerState, best: number) {
  ctx.clearRect(0, 0, W, H);
  drawTrack(ctx);

  // Far items first so near ones overlap them.
  const items = [
    ...s.obstacles.map((o) => ({ kind: o.kind, lane: o.lane, z: o.z })),
    ...s.coins.map((c) => ({ kind: "coin" as const, lane: c.lane, z: c.z })),
  ]
    .filter((i) => i.z >= 0)
    .sort((a, b) => b.z - a.z);
  for (const item of items) {
    const { x, y, k } = project(item.z, item.lane);
    if (item.kind === "train") drawTrain(ctx, x, y, k);
    else if (item.kind === "barrier") drawBarrier(ctx, x, y, k);
    else drawCoin(ctx, x, y, k);
  }

  drawRunner(ctx, s);
  drawHud(ctx, s, best);
}

/**
 * "Subway Dash": a small original runner for the hidden easter egg. The rules live in lib/runner.ts;
 * this component only handles input, the animation loop and drawing.
 */
export function SubwayDash() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<RunnerState>(createRunner(Math.floor(Math.random() * 100000) + 1));
  const queueRef = useRef<Action[]>([]);
  const bestRef = useRef(0);

  const begin = () => {
    if (gameRef.current.status !== "running") gameRef.current = startRunner(gameRef.current);
  };
  const press = (action: Action) => {
    if (gameRef.current.status === "running" && queueRef.current.length < MAX_QUEUED_INPUTS) {
      queueRef.current.push(action);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frameId = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const prev = gameRef.current;
      const next = step(prev, queueRef.current, dt);
      queueRef.current = [];
      if (prev.status === "running" && next.status === "crashed") {
        bestRef.current = Math.max(bestRef.current, scoreOf(next));
      }
      gameRef.current = next;
      draw(ctx, next, bestRef.current);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    // Focus after the dialog has finished opening, so Enter starts the game and does not press "Close".
    const focusTimer = window.setTimeout(() => canvas.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter") {
        e.preventDefault();
        begin();
        return;
      }
      const action = KEY_ACTIONS[e.code];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) press(action);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
    // begin and press only touch refs, so the listeners above are safe to capture once.
  }, []);

  return (
    <div className="dash">
      <canvas
        ref={canvasRef}
        className="dash-canvas"
        width={W}
        height={H}
        tabIndex={0}
        role="img"
        aria-label="Subway Dash, a small endless runner. Arrow keys change lane and jump. Enter starts or restarts."
        onClick={begin}
      />
      <div className="dash-controls">
        <button type="button" className="btn" aria-label="Change lane left" onPointerDown={() => press("left")}>
          ◀
        </button>
        <button type="button" className="btn" aria-label="Jump" onPointerDown={() => press("jump")}>
          ▲
        </button>
        <button type="button" className="btn" aria-label="Change lane right" onPointerDown={() => press("right")}>
          ▶
        </button>
        <button type="button" className="btn btn-primary" onClick={begin}>
          Start / restart
        </button>
      </div>
      <p className="muted small dash-note">
        Original runner built for this demo, in the spirit of endless-runner games. It is not affiliated with Subway Surfers and uses none
        of its assets.
      </p>
    </div>
  );
}
