/**
 * Shared, framework-agnostic types used across the whole extension.
 *
 * Everything in here is plain data - no DOM, no game-specific logic - so the
 * solver, simulator, adapters and popup can all share one vocabulary.
 */

export type Direction = "N" | "E" | "S" | "W";
export type Color = "red" | "green" | "blue";
export type Condition = "any" | Color;

/**
 * Internal command vocabulary.
 *
 * CALL_F1..CALL_F5 are read from the game (the number of callable functions is
 * not assumed to be fixed - the adapter reports how many slots exist).
 */
export type Command =
  | "FORWARD"
  | "LEFT"
  | "RIGHT"
  | "CALL_F1"
  | "CALL_F2"
  | "CALL_F3"
  | "CALL_F4"
  | "CALL_F5"
  | "PAINT_RED"
  | "PAINT_GREEN"
  | "PAINT_BLUE";

export interface Cell {
  x: number;
  y: number;
  walkable: boolean;
  color?: Color;
  hasStar: boolean;
  isStart: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  direction: Direction;
}

export interface Board {
  width: number;
  height: number;
  cells: Cell[][];
  player: PlayerState;
  starsTotal: number;
}

/** One program slot. `command === null` means an empty slot. */
export interface ProgramInstruction {
  condition: Condition;
  command: Command | null;
}

/** A function body (F1 is index 0). */
export type FunctionBody = ProgramInstruction[];

/** The full program: array of function bodies. */
export type Solution = FunctionBody[];

/** What the current level lets us program with. */
export interface AvailableCommands {
  /** Non-call commands that can be placed in slots (move/turn/paint). */
  commands: Command[];
  /** Slots per function, e.g. [5, 4, 0, 0, 0] means F1 has 5 slots, F2 has 4. */
  functionSlots: number[];
  /** Condition labels that can be attached to a command. */
  conditions: Condition[];
}

export const DIRECTION_DELTA: Record<Direction, readonly [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

const DIRECTION_ORDER: Direction[] = ["N", "E", "S", "W"];

export function turnLeft(direction: Direction): Direction {
  return DIRECTION_ORDER[(DIRECTION_ORDER.indexOf(direction) + 3) % 4];
}

export function turnRight(direction: Direction): Direction {
  return DIRECTION_ORDER[(DIRECTION_ORDER.indexOf(direction) + 1) % 4];
}

/**
 * RoboZZle direction indices: 0 = E, 1 = S, 2 = W, 3 = N.
 * (The robot moves col++ when dir is 0, row++ when 1, col-- when 2, row-- when 3.)
 */
export function directionFromGameIndex(index: number): Direction {
  return DIRECTION_ORDER[((index + 1) % 4 + 4) % 4];
}

export function gameIndexFromDirection(direction: Direction): number {
  return (DIRECTION_ORDER.indexOf(direction) + 3) % 4;
}

export function colorFromGameChar(c: string | null | undefined): Color | undefined {
  switch (c) {
    case "R":
      return "red";
    case "G":
      return "green";
    case "B":
      return "blue";
    default:
      return undefined;
  }
}

export function gameCharFromColor(color: Color): string {
  switch (color) {
    case "red":
      return "R";
    case "green":
      return "G";
    case "blue":
      return "B";
  }
}

export function gameConditionCode(condition: Condition): string {
  return condition === "any" ? "any" : gameCharFromColor(condition);
}

export function conditionFromGameCode(code: string | null | undefined): Condition {
  if (!code || code === "any") return "any";
  return colorFromGameChar(code) ?? "any";
}

export function gameCommandCode(command: Command): string {
  switch (command) {
    case "FORWARD":
      return "f";
    case "LEFT":
      return "l";
    case "RIGHT":
      return "r";
    case "CALL_F1":
      return "1";
    case "CALL_F2":
      return "2";
    case "CALL_F3":
      return "3";
    case "CALL_F4":
      return "4";
    case "CALL_F5":
      return "5";
    case "PAINT_RED":
      return "R";
    case "PAINT_GREEN":
      return "G";
    case "PAINT_BLUE":
      return "B";
  }
}

export function commandFromGameCode(code: string | null | undefined): Command | null {
  switch (code) {
    case "f":
      return "FORWARD";
    case "l":
      return "LEFT";
    case "r":
      return "RIGHT";
    case "1":
      return "CALL_F1";
    case "2":
      return "CALL_F2";
    case "3":
      return "CALL_F3";
    case "4":
      return "CALL_F4";
    case "5":
      return "CALL_F5";
    case "R":
      return "PAINT_RED";
    case "G":
      return "PAINT_GREEN";
    case "B":
      return "PAINT_BLUE";
    default:
      return null;
  }
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
