import type {
  AvailableCommands,
  Board,
  Color,
  Command,
  Condition,
  FunctionBody,
  ProgramInstruction,
  Solution,
} from "../shared/types";
import { fastSimulate } from "./simulator";
import { countInstructions, pickBest } from "./optimizer";
import type { SolveResult, SolverOptions, SolveStats } from "./types";

/**
 * State-space solver for RoboZZle-style levels.
 *
 * The search space is the set of all programs of a given "length", where length
 * counts non-empty instructions. We use iterative deepening: enumerate every
 * program of length 0, then 1, then 2, ... and return the first (optimal)
 * solutions found, so "fewest instructions" is guaranteed.
 *
 * The enumeration is made tractable with three prunes:
 *   1. Left-packing - empty slots are semantic no-ops in this game, so a
 *      function's instructions can be assumed packed at the front. This removes
 *      the (2^n) blowup from where empty slots may appear.
 *   2. Reachability - a function whose body is non-empty but that nothing calls
 *      is equivalent to an empty function, which was already enumerated at a
 *      smaller length. Such programs are skipped.
 *   3. Condition/colour pruning - conditions whose colour never appears on the
 *      board are omitted (they behave like empty slots).
 *
 * Each candidate is run through the memoized simulator. The memoizer turns
 * loops / recursion into cheap cached function calls, which keeps the per-candidate
 * cost low even for programs that run for ~1000 game steps.
 */

interface ProgramOption {
  condition: Condition;
  command: Command;
}

export function solve(board: Board, available: AvailableCommands, options: SolverOptions = {}): SolveResult {
  const maxLen = options.maxProgramLength ?? 20;
  const maxCandidates = options.maxCandidates ?? 500_000;
  const timeLimitMs = options.timeLimitMs ?? 15_000;
  const maxSolutions = options.maxSolutionsPerLength ?? 10;
  const maxSteps = options.maxSteps ?? 1000;

  const stats: SolveStats = { candidatesSimulated: 0, lengthReached: 0, elapsedMs: 0 };
  const start = Date.now();

  const caps = available.functionSlots;
  const result: SolveResult = {
    found: false,
    message: "No solution found within the search limit.",
    stats,
  };
  if (!caps.length) {
    result.message = "No program slots detected.";
    return result;
  }

  const totalSlots = caps.reduce((a, b) => a + b, 0);
  const suffixSums = new Array(caps.length + 1).fill(0);
  for (let i = caps.length - 1; i >= 0; i--) suffixSums[i] = suffixSums[i + 1] + caps[i];

  const conditions = buildConditions(board, available.conditions);
  const baseCommands = orderBaseCommands(available.commands);

  const solutions: Solution[] = [];

  outer: for (let length = 0; length <= Math.min(maxLen, totalSlots); length++) {
    if (Date.now() - start > timeLimitMs) break;
    stats.lengthReached = length;

    for (const sizes of distributeInstructions(caps, length, suffixSums)) {
      if (Date.now() - start > timeLimitMs) break outer;

      const optionsPerSlot = buildOptions(sizes, conditions, baseCommands);

      for (const program of generateAssignments(sizes, caps, optionsPerSlot)) {
        stats.candidatesSimulated++;
        if (stats.candidatesSimulated > maxCandidates) break outer;
        if (stats.candidatesSimulated % 2000 === 0 && Date.now() - start > timeLimitMs) break outer;

        if (!isReachable(program, sizes)) continue;

        const snapshot = cloneSolution(program);
        const run = fastSimulate(snapshot, board, maxSteps);
        if (run.status === "victory") {
          solutions.push(snapshot);
          if (solutions.length >= maxSolutions) break outer;
        }
      }
    }

    if (solutions.length) break;
  }

  stats.elapsedMs = Date.now() - start;

  if (solutions.length) {
    const best = pickBest(solutions);
    result.found = true;
    result.solution = best;
    result.message = `Found solution with ${countInstructions(best)} instruction(s).`;
  } else if (stats.candidatesSimulated > maxCandidates) {
    result.message = "No solution found within the search limit.";
  } else if (stats.elapsedMs >= timeLimitMs) {
    result.message = "Search timed out. No solution found within the time limit.";
  }
  return result;
}

// ---------------------------------------------------------------------------
// Option building
// ---------------------------------------------------------------------------

function buildConditions(board: Board, gameConditions: Condition[]): Condition[] {
  const present = new Set<Color>();
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const cell = board.cells[y]?.[x];
      if (cell?.color) present.add(cell.color);
    }
  }
  const out: Condition[] = ["any"];
  for (const c of ["red", "green", "blue"] as const) {
    if (present.has(c) && gameConditions.includes(c)) out.push(c);
  }
  return out;
}

function orderBaseCommands(commands: Command[]): Command[] {
  const rank = (c: Command): number => {
    switch (c) {
      case "LEFT":
        return 0;
      case "RIGHT":
        return 1;
      case "PAINT_RED":
      case "PAINT_GREEN":
      case "PAINT_BLUE":
        return 2;
      case "FORWARD":
        return 3;
      default:
        return 4;
    }
  };
  return [...commands].filter((c) => !c.startsWith("CALL_F")).sort((a, b) => rank(a) - rank(b));
}

function buildOptions(sizes: number[], conditions: Condition[], baseCommands: Command[]): ProgramOption[] {
  const opts: ProgramOption[] = [];
  for (const cond of conditions) {
    for (const cmd of baseCommands) opts.push({ condition: cond, command: cmd });
  }
  for (let k = 1; k <= sizes.length; k++) {
    if (sizes[k - 1] > 0) {
      for (const cond of conditions) opts.push({ condition: cond, command: `CALL_F${k}` as Command });
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

/** Distribute `length` instructions across functions, F1-first. */
function* distributeInstructions(
  caps: number[],
  length: number,
  suffixSums: number[],
): Generator<number[]> {
  yield* rec(0, length, []);
  function* rec(k: number, remaining: number, acc: number[]): Generator<number[]> {
    if (k === caps.length) {
      if (remaining === 0) yield acc;
      return;
    }
    const maxHere = Math.min(caps[k], remaining);
    const minHere = Math.max(0, remaining - suffixSums[k + 1]);
    for (let s = maxHere; s >= minHere; s--) {
      yield* rec(k + 1, remaining - s, [...acc, s]);
    }
  }
}

/** Generate all packed programs matching the given per-function sizes. */
function* generateAssignments(
  sizes: number[],
  caps: number[],
  opts: ProgramOption[],
): Generator<Solution> {
  const n = caps.length;
  const bodies: FunctionBody[] = new Array(n);

  yield* fill(0);

  function* fill(k: number): Generator<Solution> {
    if (k === n) {
      yield bodies.map((b) => b);
      return;
    }
    if (sizes[k] === 0) {
      bodies[k] = [];
      yield* fill(k + 1);
      return;
    }
    const body: ProgramInstruction[] = [];
    bodies[k] = body;
    yield* choose(k, sizes[k], body);
  }

  function* choose(k: number, remaining: number, body: ProgramInstruction[]): Generator<Solution> {
    if (remaining === 0) {
      yield* fill(k + 1);
      return;
    }
    for (const opt of opts) {
      body.push({ condition: opt.condition, command: opt.command });
      yield* choose(k, remaining - 1, body);
      body.pop();
    }
  }
}

function cloneSolution(program: Solution): Solution {
  return program.map((body) => body.map((instr) => ({ condition: instr.condition, command: instr.command })));
}

/** False when a function with a non-empty body is never called (transitively) from F1. */
function isReachable(program: Solution, sizes: number[]): boolean {
  const n = sizes.length;
  const reachable = new Array(n).fill(false);
  const queue: number[] = [0];
  reachable[0] = true;
  while (queue.length) {
    const k = queue.pop()!;
    for (const instr of program[k] ?? []) {
      const m = /^CALL_F([1-9]\d*)$/.exec(instr.command ?? "");
      if (m) {
        const j = parseInt(m[1], 10) - 1;
        if (j >= 0 && j < n && !reachable[j]) {
          reachable[j] = true;
          queue.push(j);
        }
      }
    }
  }
  for (let k = 0; k < n; k++) {
    if (sizes[k] > 0 && !reachable[k]) return false;
  }
  return true;
}
