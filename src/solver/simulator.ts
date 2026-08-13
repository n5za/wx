import {
  Board,
  Color,
  DIRECTION_DELTA,
  Direction,
  PlayerState,
  Solution,
  cellKey,
  turnLeft,
  turnRight,
} from "../shared/types";

/**
 * Independent simulator for RoboZZle-style programs.
 *
 * It reproduces the real game's mechanics exactly (reverse engineered from the
 * RoboZZle JS client at robozzle.com):
 *
 *  - Execution starts at F1 slot 0 with the call stack [{sub:0, cmd:0}].
 *  - The current command is the top-of-stack slot; finished functions are
 *    popped; an empty stack ends the program (failure).
 *  - A command executes only when its condition is "any" or matches the color
 *    of the cell the robot currently stands on. Otherwise it is skipped.
 *  - FORWARD moves one cell in the facing direction; moving off the grid or
 *    onto a cell without a color crashes the program.
 *  - LEFT / RIGHT rotate the robot. CALL_Fx pushes a new function frame.
 *  - PAINT_* recolours the current cell (affects later conditions).
 *  - Stars are collected by moving onto them. The level is won the moment the
 *    last star is collected (checked before the fuel counter increments).
 *  - Moves / turns / paints each consume one "step" (fuel). Calls and skipped
 *    commands consume zero. Running out of fuel fails the program.
 *  - Infinite recursion (which would crash the real page) is detected and
 *    reported as `infiniteLoop`.
 *
 * `simulate` is the naive reference engine used for validation and for
 * producing the exact execution trace that drives the real game.
 * `fastSimulate` is the memoized engine used inside the solver.
 */

export type RunStatus = "victory" | "crashed" | "outOfFuel" | "programEnded" | "infiniteLoop";

export interface TraceSnapshot {
  slot: number;
  sub: number;
  index: number;
  x: number;
  y: number;
  direction: Direction;
  starsCollected: number;
  executed: boolean;
}

export interface RunResult {
  status: RunStatus;
  steps: number;
  executedSlots: number;
  starsCollected: number;
  collectedStars: string[];
  finalPlayer: PlayerState;
  trace: TraceSnapshot[];
}

export interface SimulatorOptions {
  maxSteps?: number;
  maxCallDepth?: number;
  collectTrace?: boolean;
}

export const DEFAULT_MAX_STEPS = 1000;
export const DEFAULT_MAX_CALL_DEPTH = 10000;

// ---------------------------------------------------------------------------
// Shared context helpers
// ---------------------------------------------------------------------------

interface SimulationContext {
  colors: Map<string, Color>;
  starsTotal: number;
  starsRemaining: Set<string>;
  collected: string[];
  maxSteps: number;
}

function createContext(board: Board, maxSteps: number): SimulationContext {
  const colors = new Map<string, Color>();
  const starsRemaining = new Set<string>();
  let starsTotal = 0;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const cell = board.cells[y]?.[x];
      if (cell?.color) colors.set(cellKey(x, y), cell.color);
      if (cell?.hasStar) {
        starsRemaining.add(cellKey(x, y));
        starsTotal++;
      }
    }
  }
  return { colors, starsTotal, starsRemaining, collected: [], maxSteps };
}

function collectStar(ctx: SimulationContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (ctx.starsRemaining.delete(k)) {
    ctx.collected.push(k);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Naive reference simulator
// ---------------------------------------------------------------------------

export function simulate(solution: Solution, board: Board, options: SimulatorOptions = {}): RunResult {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxCallDepth = options.maxCallDepth ?? DEFAULT_MAX_CALL_DEPTH;
  const collectTrace = options.collectTrace ?? true;

  const ctx = createContext(board, maxSteps);
  let x = board.player.x;
  let y = board.player.y;
  let dir = board.player.direction;
  let steps = 0;
  let slots = 0;
  const stack: { sub: number; cmd: number }[] = [{ sub: 0, cmd: 0 }];
  const trace: TraceSnapshot[] = [];
  let status: RunStatus = "programEnded";

  const snapshot = (sub: number, index: number, executed: boolean) => {
    if (collectTrace) {
      trace.push({
        slot: slots,
        sub,
        index,
        x,
        y,
        direction: dir,
        starsCollected: ctx.collected.length,
        executed,
      });
    }
  };

  while (true) {
    let top: { sub: number; cmd: number } | undefined;
    while (stack.length) {
      top = stack[stack.length - 1];
      if (top.cmd >= (solution[top.sub] ?? []).length) {
        stack.pop();
        top = undefined;
        continue;
      }
      break;
    }
    if (!top) {
      status = "programEnded";
      break;
    }
    if (stack.length > maxCallDepth) {
      status = "infiniteLoop";
      break;
    }

    const instr = solution[top.sub][top.cmd];
    top.cmd++;
    slots++;

    const cellColor = ctx.colors.get(cellKey(x, y));
    const matches = instr.command !== null && (instr.condition === "any" || instr.condition === cellColor);
    if (!matches) {
      snapshot(top.sub, top.cmd - 1, false);
      continue;
    }

    const command = instr.command!;
    let acted = false;
    switch (command) {
      case "FORWARD": {
        const [dx, dy] = DIRECTION_DELTA[dir];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= board.width || ny >= board.height || !ctx.colors.has(cellKey(nx, ny))) {
          status = "crashed";
          snapshot(top.sub, top.cmd - 1, true);
          break;
        }
        x = nx;
        y = ny;
        collectStar(ctx, x, y);
        acted = true;
        break;
      }
      case "LEFT":
        dir = turnLeft(dir);
        acted = true;
        break;
      case "RIGHT":
        dir = turnRight(dir);
        acted = true;
        break;
      case "PAINT_RED":
        ctx.colors.set(cellKey(x, y), "red");
        acted = true;
        break;
      case "PAINT_GREEN":
        ctx.colors.set(cellKey(x, y), "green");
        acted = true;
        break;
      case "PAINT_BLUE":
        ctx.colors.set(cellKey(x, y), "blue");
        acted = true;
        break;
      default: {
        const m = /^CALL_F([1-9]\d*)$/.exec(command);
        if (m) {
          stack.push({ sub: parseInt(m[1], 10) - 1, cmd: 0 });
        }
        break;
      }
    }
    if (status === "crashed") break;

    snapshot(top.sub, top.cmd - 1, true);

    if (acted) {
      if (ctx.starsTotal > 0 && ctx.starsRemaining.size === 0) {
        status = "victory";
        break;
      }
      steps++;
      if (steps >= maxSteps) {
        status = "outOfFuel";
        break;
      }
    }
  }

  return {
    status,
    steps,
    executedSlots: slots,
    starsCollected: ctx.collected.length,
    collectedStars: ctx.collected,
    finalPlayer: { x, y, direction: dir },
    trace,
  };
}

// ---------------------------------------------------------------------------
// Memoized fast engine (used by the solver)
// ---------------------------------------------------------------------------

interface CachedSubRun {
  terminal: RunStatus | null;
  stepsUsed: number;
  slotsUsed: number;
  endX: number;
  endY: number;
  endDir: Direction;
  addedStars: string[];
  paints: Array<[string, Color]>;
}

interface FastEngine {
  solution: Solution;
  board: Board;
  ctx: SimulationContext;
  paints: Map<string, Color>;
  steps: number;
  slots: number;
  x: number;
  y: number;
  dir: Direction;
  memo: Map<string, CachedSubRun>;
  pending: Set<string>;
}

const MEMO_CAP = 50_000;
const SLOT_CAP = 2_000_000;

function stateKeyOf(engine: FastEngine, subIdx: number): string {
  const stars = Array.from(engine.ctx.starsRemaining)
    .sort()
    .join(",");
  const paints = Array.from(engine.paints.entries())
    .map(([k, c]) => `${k}:${c}`)
    .sort()
    .join(",");
  return `${subIdx}|${engine.x}|${engine.y}|${engine.dir}|${stars || "."}|${paints || "."}`;
}

function applyDiff(engine: FastEngine, diff: CachedSubRun): void {
  engine.steps += diff.stepsUsed;
  engine.slots += diff.slotsUsed;
  engine.x = diff.endX;
  engine.y = diff.endY;
  engine.dir = diff.endDir;
  for (const star of diff.addedStars) {
    if (engine.ctx.starsRemaining.delete(star)) engine.ctx.collected.push(star);
  }
  for (const [k, c] of diff.paints) {
    engine.ctx.colors.set(k, c);
    engine.paints.set(k, c);
  }
}

function executeSubBody(engine: FastEngine, subIdx: number): CachedSubRun {
  const key = stateKeyOf(engine, subIdx);
  const cached = engine.memo.get(key);
  const remaining = engine.ctx.maxSteps - engine.steps;
  if (cached && cached.stepsUsed < remaining) {
    applyDiff(engine, cached);
    return cached;
  }

  if (engine.pending.has(key)) {
    // Same (function, state) re-entered without completing -> infinite recursion.
    return {
      terminal: "infiniteLoop",
      stepsUsed: 0,
      slotsUsed: 0,
      endX: engine.x,
      endY: engine.y,
      endDir: engine.dir,
      addedStars: [],
      paints: [],
    };
  }
  engine.pending.add(key);

  const startSteps = engine.steps;
  const startSlots = engine.slots;
  const addedStars: string[] = [];
  const paints: Array<[string, Color]> = [];
  const stack: { sub: number; cmd: number }[] = [{ sub: subIdx, cmd: 0 }];
  let terminal: RunStatus | null = null;

  while (true) {
    let top: { sub: number; cmd: number } | undefined;
    while (stack.length) {
      top = stack[stack.length - 1];
      if (top.cmd >= (engine.solution[top.sub] ?? []).length) {
        stack.pop();
        top = undefined;
        continue;
      }
      break;
    }
    if (!top) break;
    if (stack.length > DEFAULT_MAX_CALL_DEPTH || engine.slots > SLOT_CAP) {
      terminal = "infiniteLoop";
      break;
    }

    const instr = engine.solution[top.sub][top.cmd];
    top.cmd++;
    engine.slots++;

    const cellColor = engine.ctx.colors.get(cellKey(engine.x, engine.y));
    if (instr.command === null || !(instr.condition === "any" || instr.condition === cellColor)) continue;

    const command = instr.command;
    let acted = false;
    switch (command) {
      case "FORWARD": {
        const [dx, dy] = DIRECTION_DELTA[engine.dir];
        const nx = engine.x + dx;
        const ny = engine.y + dy;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= engine.board.width ||
          ny >= engine.board.height ||
          !engine.ctx.colors.has(cellKey(nx, ny))
        ) {
          terminal = "crashed";
          break;
        }
        engine.x = nx;
        engine.y = ny;
        const k = cellKey(engine.x, engine.y);
        if (engine.ctx.starsRemaining.delete(k)) {
          engine.ctx.collected.push(k);
          addedStars.push(k);
        }
        acted = true;
        break;
      }
      case "LEFT":
        engine.dir = turnLeft(engine.dir);
        acted = true;
        break;
      case "RIGHT":
        engine.dir = turnRight(engine.dir);
        acted = true;
        break;
      case "PAINT_RED":
      case "PAINT_GREEN":
      case "PAINT_BLUE": {
        const color: Color = command === "PAINT_RED" ? "red" : command === "PAINT_GREEN" ? "green" : "blue";
        const k = cellKey(engine.x, engine.y);
        engine.ctx.colors.set(k, color);
        engine.paints.set(k, color);
        paints.push([k, color]);
        acted = true;
        break;
      }
      default: {
        const m = /^CALL_F([1-9]\d*)$/.exec(command);
        if (m) {
          const subRes = executeSubBody(engine, parseInt(m[1], 10) - 1);
          if (subRes.terminal) {
            terminal = subRes.terminal;
            break;
          }
        }
        break;
      }
    }
    if (terminal) break;

    if (acted) {
      if (engine.ctx.starsTotal > 0 && engine.ctx.starsRemaining.size === 0) {
        terminal = "victory";
        break;
      }
      engine.steps++;
      if (engine.steps >= engine.ctx.maxSteps) {
        terminal = "outOfFuel";
        break;
      }
    }
  }

  engine.pending.delete(key);

  const diff: CachedSubRun = {
    terminal,
    stepsUsed: engine.steps - startSteps,
    slotsUsed: engine.slots - startSlots,
    endX: engine.x,
    endY: engine.y,
    endDir: engine.dir,
    addedStars,
    paints,
  };
  if (engine.memo.size < MEMO_CAP) engine.memo.set(key, diff);
  return diff;
}

export interface FastRunResult {
  status: RunStatus;
  steps: number;
  executedSlots: number;
  starsCollected: number;
}

export function fastSimulate(solution: Solution, board: Board, maxSteps: number = DEFAULT_MAX_STEPS): FastRunResult {
  const engine: FastEngine = {
    solution,
    board,
    ctx: createContext(board, maxSteps),
    paints: new Map(),
    steps: 0,
    slots: 0,
    x: board.player.x,
    y: board.player.y,
    dir: board.player.direction,
    memo: new Map(),
    pending: new Set(),
  };

  const res = executeSubBody(engine, 0);
  const status: RunStatus = res.terminal === "victory" ? "victory" : res.terminal ?? "programEnded";
  return { status, steps: engine.steps, executedSlots: engine.slots, starsCollected: engine.ctx.collected.length };
}
