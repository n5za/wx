import type { Board, Direction, PlayerState, Solution } from "../shared/types";
import { gameConditionCode, gameCommandCode } from "../shared/types";
import type { GameAdapter } from "../adapters/GameAdapter";
import { simulate } from "../solver/simulator";

/**
 * Executes a validated solution inside the live game, one command at a time,
 * while continuously verifying the real game against the offline simulation.
 *
 * Flow (per the project spec):
 *   1. validate the solution by simulating it (never touches the game),
 *   2. reset the level and write the program into the game,
 *   3. step through the game, comparing actual vs. simulated robot state
 *      after every command,
 *   4. report progress and the outcome.
 */
export interface ExecutionOutcome {
  success: boolean;
  status: "victory" | "failed" | "stopped" | "stateChanged" | "error";
  message: string;
  steps: number;
}

export interface ExecutionConfig {
  adapter: GameAdapter;
  board: Board;
  solution: Solution;
  /** Per-command pacing in ms (0-1000; 250 default). */
  speedMs?: number;
  onProgress?: (executed: number, total: number) => void;
}

export class ExecutionController {
  private paused = false;
  private stopped = false;
  private resumeResolvers: Array<() => void> = [];
  private config: ExecutionConfig;
  private padSlots: number[];

  constructor(config: ExecutionConfig, padSlots: number[]) {
    this.config = config;
    this.padSlots = padSlots;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const resolvers = this.resumeResolvers.splice(0);
    for (const r of resolvers) r();
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;
    const resolvers = this.resumeResolvers.splice(0);
    for (const r of resolvers) r();
  }

  async run(): Promise<ExecutionOutcome> {
    const { adapter, board, solution, onProgress } = this.config;
    const speedMs = clampSpeed(this.config.speedMs ?? 250);

    // 1. Offline validation.
    const padded = padToSlots(solution, this.padSlots);
    const sim = simulate(padded, board, { maxSteps: 1000, collectTrace: true });
    if (sim.status !== "victory") {
      return { success: false, status: "error", message: statusMessage(sim.status), steps: 0 };
    }
    if (adapter.setSpeed) adapter.setSpeed(speedMs);

    // 2. Reset + write.
    try {
      await adapter.resetLevel();
      await adapter.writeProgram(padded);
    } catch (err) {
      return { success: false, status: "error", message: String(err), steps: 0 };
    }
    await this.sleep(80);

    // 3. Step through the game.
    const trace = sim.trace; // trace[i] = state after the i-th executed slot
    const total = trace.length;
    onProgress?.(0, total);

    for (let i = 0; i < trace.length; i++) {
      while (this.paused && !this.stopped) await this.waitForResume();
      if (this.stopped) break;

      await adapter.stepOnce();
      await this.waitForIdle(3000);

      const expected = trace[i];
      let actual: PlayerState;
      try {
        actual = adapter.readPlayer();
      } catch (err) {
        return { success: false, status: "error", message: String(err), steps: i };
      }

      // Victory may complete asynchronously; check before reporting divergence.
      if (this.isComplete(adapter)) {
        onProgress?.(i + 1, total);
        return { success: true, status: "victory", message: "Level solved successfully!", steps: i + 1 };
      }

      if (!sameState(actual, expected)) {
        return {
          success: false,
          status: "stateChanged",
          message:
            "Execution stopped because the game state changed (simulated vs. actual robot " +
            `mismatch at step ${i + 1}). Re-analyze the level and try again.`,
          steps: i,
        };
      }

      onProgress?.(i + 1, total);
      if (speedMs > 0) await this.sleep(speedMs);
    }

    // 4. Final completion check.
    if (this.stopped) {
      return { success: false, status: "stopped", message: "Execution stopped by the user.", steps: 0 };
    }
    await this.sleep(120);
    if (this.isComplete(adapter)) {
      return { success: true, status: "victory", message: "Level solved successfully!", steps: total };
    }
    // Let the game settle into its "finished" state (one more Step is harmless).
    try {
      await adapter.stepOnce();
      await this.sleep(80);
    } catch {
      /* ignore */
    }
    return {
      success: false,
      status: "failed",
      message: "The program finished but did not solve the level.",
      steps: total,
    };
  }

  private isComplete(adapter: GameAdapter): boolean {
    try {
      return adapter.isLevelComplete();
    } catch {
      return false;
    }
  }

  /** Wait until the game's robot has finished the current command. */
  private async waitForIdle(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let idle = true;
      try {
        idle = await this.config.adapter.isIdle();
      } catch {
        idle = true;
      }
      if (idle || Date.now() > deadline) return;
      await this.sleep(20);
    }
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => this.resumeResolvers.push(resolve));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sameState(a: PlayerState, b: PlayerState): boolean {
  return a.x === b.x && a.y === b.y && a.direction === b.direction;
}

function clampSpeed(ms: number): number {
  if (!Number.isFinite(ms)) return 250;
  return Math.max(50, Math.min(1000, ms));
}

function statusMessage(status: string): string {
  switch (status) {
    case "victory":
      return "Simulation says the solution wins.";
    case "programEnded":
      return "The solution does not collect all the stars.";
    case "crashed":
      return "The solution walks into a wall or leaves the board.";
    case "outOfFuel":
      return "The solution exceeds 1000 steps.";
    case "infiniteLoop":
      return "The solution contains an infinite loop.";
    default:
      return `Simulation failed: ${status}.`;
  }
}

/**
 * Pad a packed solution so that every function has the exact slot count the
 * game's level defines. The game's execution cursor walks the full-length
 * function (empty trailing slots included), so the simulation must use the
 * same layout for its step count to match the game's Step clicks.
 */
export function padToSlots(solution: Solution, caps: number[]): Solution {
  const result: Solution = [];
  const functions = Math.max(solution.length, caps.length);
  for (let k = 0; k < functions; k++) {
    const cap = caps[k] ?? 0;
    const body = solution[k] ?? [];
    if (body.length > cap) {
      throw new Error(`Solution uses more slots than function F${k + 1} provides.`);
    }
    const padded = body.map((instr) => ({ ...instr }));
    for (let i = body.length; i < cap; i++) {
      padded.push({ condition: "any", command: null });
    }
    result.push(padded);
  }
  return result;
}
