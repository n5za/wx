import type { AvailableCommands, Board, Command, PlayerState, Solution } from "../shared/types";
import { directionFromGameIndex, gameCommandCode, gameConditionCode } from "../shared/types";
import { parseFromLevelData } from "../content/boardParser";
import { DOMGameAdapter } from "./DOMGameAdapter";
import type { GameAdapter } from "./GameAdapter";
import type { RoboSolverBridge } from "./bridgeApi";

/**
 * State-precise adapter: uses the injected page bridge (`window.__robosolver`)
 * for exact reads (robot position, stars, run state) and reliable controls
 * (reset), falling back to the DOM adapter for anything the bridge cannot do.
 */
export class GameStateAdapter implements GameAdapter {
  readonly kind = "state" as const;
  private dom: DOMGameAdapter;
  private bridge: RoboSolverBridge | null;

  constructor(bridge: RoboSolverBridge | null = typeof window !== "undefined" ? window.__robosolver ?? null : null) {
    this.dom = new DOMGameAdapter();
    this.bridge = bridge;
  }

  detect(): boolean {
    return this.bridge?.present() ?? false;
  }

  readBoard(): Board {
    const level = this.bridge?.getLevel();
    if (level) return parseFromLevelData(level);
    return this.dom.readBoard();
  }

  readPlayer(): PlayerState {
    const state = this.bridge?.getState();
    if (state) {
      return {
        x: state.robotCol,
        y: state.robotRow,
        direction: directionFromGameIndex(state.robotDir),
      };
    }
    return this.dom.readPlayer();
  }

  readRemainingStars(): number {
    const state = this.bridge?.getState();
    if (state) return state.stars;
    return this.dom.readRemainingStars();
  }

  readCommands(): AvailableCommands {
    return this.dom.readCommands();
  }

  readLevelInfo(): { gameId?: string; title?: string } {
    return this.dom.readLevelInfo();
  }

  async writeProgram(solution: Solution): Promise<void> {
    // Prefer the bridge: it writes through the game's own data structure
    // (`robozzle.program`), so a later `displayProgram()` (e.g. on reset) keeps
    // the written program instead of rebuilding an empty one.
    if (this.bridge?.present()) {
      const encoded: Array<Array<[string | null, string | null] | null>> = solution.map((body) =>
        body.map((instr) =>
          instr.command
            ? [gameConditionCode(instr.condition), gameCommandCode(instr.command)]
            : null,
        ),
      );
      const ok = this.bridge.setProgram(encoded);
      if (ok) return;
    }
    await this.dom.writeProgram(solution);
  }

  async resetLevel(): Promise<void> {
    const ok = this.bridge?.reset();
    if (ok) return;
    await this.dom.resetLevel();
  }

  async stepOnce(): Promise<void> {
    const ok = this.bridge?.step();
    if (ok) return;
    await this.dom.stepOnce();
  }

  async runProgram(): Promise<void> {
    const ok = this.bridge?.go();
    if (ok) return;
    await this.dom.runProgram();
  }

  isLevelComplete(): boolean {
    const state = this.bridge?.getState();
    if (state) return state.stars === 0 && state.starsMax > 0;
    return this.dom.isLevelComplete();
  }

  isRunning(): boolean {
    const state = this.bridge?.getState();
    if (state) return state.robotState === 2 || state.robotState === 3;
    return this.dom.isRunning();
  }

  async isIdle(): Promise<boolean> {
    const state = this.bridge?.getState();
    if (state) return state.robotState === 0 || state.robotState === 1 || state.robotState === 4;
    return this.dom.isIdle();
  }

  async executeCommand(command: Command): Promise<void> {
    await this.dom.executeCommand(command);
  }

  setSpeed(ms: number): void {
    this.bridge?.setSpeed(ms);
  }

  debugDump(): unknown {
    return {
      bridge: this.bridge
        ? { level: this.bridge.getLevel(), state: this.bridge.getState() }
        : null,
      dom: this.dom.debugDump(),
    };
  }
}
