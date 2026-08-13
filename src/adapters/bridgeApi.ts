/**
 * Types describing the bridge injected into the page's main world.
 *
 * The real RoboZZle client keeps all state in a global `robozzle` object that
 * is unreachable from the content script's isolated world. The bridge exposes a
 * minimal, safe subset of it. When the bridge is absent, adapters fall back to
 * pure DOM inspection.
 */

export interface RoboLevelData {
  Id: string | number;
  Title?: string;
  Colors: string[];
  Items: string[];
  RobotRow: number;
  RobotCol: number;
  RobotDir: number;
  AllowedCommands: number;
  SubLengths: number[];
  DisallowSubs?: boolean;
  DisallowColors?: boolean;
}

export interface RoboGameStateData {
  robotCol: number;
  robotRow: number;
  robotDir: number;
  stars: number;
  starsMax: number;
  steps: number;
  /** 0=reset 1=stopped 2=started 3=stepping 4=finished */
  robotState: number;
}

export interface RoboSolverBridge {
  version: number;
  present(): boolean;
  getLevel(): RoboLevelData | null;
  getState(): RoboGameStateData | null;
  readProgram(): Array<Array<[string | null, string | null]>> | null;
  setProgram(program: Array<Array<[string | null, string | null] | null>>): boolean;
  reset(): boolean;
  step(): boolean;
  go(): boolean;
  setSpeed(v: number): void;
}

declare global {
  interface Window {
    __robosolver?: RoboSolverBridge;
  }
}
