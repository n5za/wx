import type { Board, Solution } from "../shared/types";

export interface SolverOptions {
  /** Maximum number of non-empty instructions to search. */
  maxProgramLength?: number;
  /** Step/fuel budget used during simulation (the game uses 1000). */
  maxSteps?: number;
  /** Maximum number of candidate programs to simulate. */
  maxCandidates?: number;
  /** Wall-clock budget for the search in milliseconds. */
  timeLimitMs?: number;
  /** How many same-length solutions to keep before optimizing. */
  maxSolutionsPerLength?: number;
}

export interface SolveStats {
  candidatesSimulated: number;
  lengthReached: number;
  elapsedMs: number;
}

export interface SolveResult {
  found: boolean;
  solution?: Solution;
  message: string;
  stats: SolveStats;
}

export interface SimulationResultOf {
  status: "victory" | "crashed" | "outOfFuel" | "programEnded" | "infiniteLoop";
  steps: number;
  executedSlots: number;
  starsCollected: number;
}
