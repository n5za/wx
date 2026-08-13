import type { AvailableCommands, Board, Command, PlayerState, Solution } from "../shared/types";

/**
 * The contract every game adapter implements.
 *
 * Adapters translate between the concrete webpage (DOM / canvas / page state)
 * and the generic data model used by the solver. Only the adapters know about
 * the game - everything upstream of them is game-agnostic.
 */
export interface GameAdapter {
  readonly kind: "dom" | "state" | "canvas";

  /** Whether this adapter can currently read a game from the page. */
  detect(): boolean;

  /** Parse the whole board (cells, stars, start/player position). */
  readBoard(): Board;

  /** Current robot position/direction. */
  readPlayer(): PlayerState;

  /** How many stars are still on the board. */
  readRemainingStars(): number;

  /** What the level allows us to program (commands, functions, conditions). */
  readCommands(): AvailableCommands;

  readLevelInfo(): { gameId?: string; title?: string };

  /** Write a solution into the game's program slots. */
  writeProgram(solution: Solution): Promise<void>;

  /** Restore the board to its initial state. */
  resetLevel(): Promise<void>;

  /** Execute exactly one command slot (the game's "Step" action). */
  stepOnce(): Promise<void>;

  /** Start a full-speed run of the current program. */
  runProgram(): Promise<void>;

  /** True when the level has been completed by the current run. */
  isLevelComplete(): boolean;

  /** True while the game's robot is mid-run. */
  isRunning(): boolean;

  /** True when the game is idle and can be stepped (reset/stopped/finished). */
  isIdle(): Promise<boolean>;

  /** Optional: nudge the game's own execution speed to `ms` per command. */
  setSpeed?(ms: number): void;

  /** Low-level primitive: place a single command into the next available slot. */
  executeCommand(command: Command): Promise<void>;

  /** Raw game state for the debug panel. */
  debugDump(): unknown;
}

export class GameDetectionError extends Error {
  constructor(message = "Game not detected.") {
    super(message);
    this.name = "GameDetectionError";
  }
}
