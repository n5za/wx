import type { AvailableCommands, Board, Color, Command, PlayerState, Solution } from "../shared/types";
import type { GameAdapter } from "./GameAdapter";

/**
 * Last-resort adapter for games rendered entirely through `<canvas>`.
 *
 * The board is reconstructed by pixel analysis only - no DOM is available for
 * the play area. The parse pipeline is split into pure, unit-testable helpers:
 *
 *   1. `detectGrid`  - find the cell grid from background-coloured lines,
 *   2. `analyzeCells`- classify each cell (colour / star / robot) by sampling,
 *   3. `parseCanvasBoard` - assemble a `Board`.
 *
 * Because program slots, allowed commands and (usually) the robot's direction
 * cannot be recovered from pixels, execution on canvas games is not supported;
 * the adapter reports a clear error rather than guessing.
 */

export class CanvasGameAdapter implements GameAdapter {
  readonly kind = "canvas" as const;
  private canvas: HTMLCanvasElement | null;
  private parsed: Board | null = null;

  constructor(canvas: HTMLCanvasElement | null = pickLargestCanvas()) {
    this.canvas = canvas;
  }

  detect(): boolean {
    return this.canvas != null && !document.querySelector("#board");
  }

  readBoard(): Board {
    if (!this.parsed) this.parsed = parseCanvasBoard(this.canvas!, { direction: "detect" });
    return this.parsed;
  }

  readPlayer(): PlayerState {
    return this.readBoard().player;
  }

  readRemainingStars(): number {
    return this.readBoard().starsTotal;
  }

  readCommands(): AvailableCommands {
    return { commands: ["FORWARD", "LEFT", "RIGHT"], functionSlots: [1], conditions: ["any"] };
  }

  readLevelInfo(): { gameId?: string; title?: string } {
    return {};
  }

  async writeProgram(): Promise<void> {
    throw new Error("Canvas games: program slots are not rendered, so writing a program is not supported.");
  }

  async resetLevel(): Promise<void> {
    throw new Error("Canvas games: reset is not supported.");
  }

  async stepOnce(): Promise<void> {
    throw new Error("Canvas games: stepping is not supported.");
  }

  async runProgram(): Promise<void> {
    throw new Error("Canvas games: running the program is not supported.");
  }

  isLevelComplete(): boolean {
    return false;
  }

  isRunning(): boolean {
    return false;
  }

  isIdle(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async executeCommand(): Promise<void> {
    throw new Error("Canvas games: command execution is not supported.");
  }

  debugDump(): unknown {
    return this.canvas ? { canvas: { width: this.canvas.width, height: this.canvas.height } } : null;
  }
}

// ---------------------------------------------------------------------------
// Pixel analysis (pure, testable)
// ---------------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Grid {
  originX: number;
  originY: number;
  pitch: number;
  cols: number;
  rows: number;
  background: RGB;
}

export interface CellSample {
  color: Color | null;
  hasStar: boolean;
  isRobot: boolean;
  robotDirIndex: number;
}

export const CELL_PX = 40;

const PALETTE: Record<Color, RGB> = {
  red: { r: 210, g: 40, b: 40 },
  green: { r: 30, g: 170, b: 60 },
  blue: { r: 40, g: 80, b: 200 },
};

function distance(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function near(a: RGB, b: RGB, tol = 80): boolean {
  return distance(a, b) <= tol;
}

function isBackground(rgb: RGB, bg: RGB): boolean {
  return near(rgb, bg, 60);
}

/** Most frequent colour (quantised) in the sample = background. */
export function detectBackground(pixels: Uint8ClampedArray): RGB {
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const entry = counts.get(key) ?? { count: 0, r, g, b };
    entry.count++;
    counts.set(key, entry);
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? { r: best.r, g: best.g, b: best.b } : { r: 255, g: 255, b: 255 };
}

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): RGB {
  const i = (y * width + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
}

/** Detect cell boundaries: runs of background-only rows/columns. */
export function detectGrid(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  background: RGB,
): Grid | null {
  const isBgRow: boolean[] = [];
  for (let y = 0; y < height; y++) {
    let bg = 0;
    const step = Math.max(1, Math.floor(width / 120));
    for (let x = 0; x < width; x += step) {
      if (isBackground(pixelAt(pixels, width, x, y), background)) bg++;
    }
    isBgRow.push(bg / Math.ceil(width / step) > 0.9);
  }
  const isBgCol: boolean[] = [];
  for (let x = 0; x < width; x++) {
    let bg = 0;
    const step = Math.max(1, Math.floor(height / 120));
    for (let y = 0; y < height; y += step) {
      if (isBackground(pixelAt(pixels, width, x, y), background)) bg++;
    }
    isBgCol.push(bg / Math.ceil(height / step) > 0.9);
  }

  const linesX = groupLines(compactLines(isBgCol));
  const linesY = groupLines(compactLines(isBgRow));
  if (linesX.length < 2 || linesY.length < 2) return null;

  const pitchX = medianGap(linesX);
  const pitchY = medianGap(linesY);
  if (pitchX < 4 || pitchY < 4) return null;
  const pitch = Math.round((pitchX + pitchY) / 2);

  return {
    originX: linesX[0],
    originY: linesY[0],
    pitch,
    cols: linesX.length - 1,
    rows: linesY.length - 1,
    background,
  };
}

function compactLines(flags: boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) out.push(i);
  }
  return out;
}

function groupLines(indices: number[]): number[] {
  if (indices.length === 0) return [];
  const groups: number[] = [];
  let start = indices[0];
  let prev = indices[0];
  for (let i = 1; i <= indices.length; i++) {
    const v = indices[i];
    if (v === undefined || v - prev > 4) {
      groups.push(Math.round((start + prev) / 2));
      start = v;
    }
    prev = v;
  }
  return groups;
}

function medianGap(lines: number[]): number {
  if (lines.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function classifyCell(rgb: RGB, bg: RGB): Color | null {
  if (isBackground(rgb, bg)) return null;
  let best: Color | null = null;
  let bestD = Infinity;
  for (const color of ["red", "green", "blue"] as const) {
    const d = distance(rgb, PALETTE[color]);
    if (d < bestD) {
      bestD = d;
      best = color;
    }
  }
  return bestD < 120 ? best : null;
}

/** Sample each cell's interior and classify it. */
export function analyzeCells(
  pixels: Uint8ClampedArray,
  width: number,
  grid: Grid,
): Array<Array<CellSample>> {
  const cells: Array<Array<CellSample>> = [];
  for (let row = 0; row < grid.rows; row++) {
    const line: Array<CellSample> = [];
    for (let col = 0; col < grid.cols; col++) {
      const cx = Math.floor(grid.originX + col * grid.pitch + grid.pitch / 2);
      const cy = Math.floor(grid.originY + row * grid.pitch + grid.pitch / 2);
      const sample = pixelAt(pixels, width, cx, cy);
      const color = classifyCell(sample, grid.background);
      let hasStar = false;
      let isRobot = false;
      if (color === null && !isBackground(sample, grid.background)) {
        isRobot = true;
      }
      if (color !== null) {
        hasStar = detectStar(pixels, width, grid, row, col);
      }
      line.push({ color, hasStar, isRobot, robotDirIndex: 0 });
    }
    cells.push(line);
  }
  return cells;
}

/** A star is a bright yellow/white blob inside an otherwise-coloured cell. */
function detectStar(pixels: Uint8ClampedArray, width: number, grid: Grid, row: number, col: number): boolean {
  const originX = Math.floor(grid.originX + col * grid.pitch + grid.pitch / 4);
  const originY = Math.floor(grid.originY + row * grid.pitch + grid.pitch / 4);
  const endX = Math.floor(originX + grid.pitch / 2);
  const endY = Math.floor(originY + grid.pitch / 2);
  let bright = 0;
  let total = 0;
  for (let y = originY; y < endY; y++) {
    for (let x = originX; x < endX; x++) {
      const rgb = pixelAt(pixels, width, x, y);
      total++;
      if (rgb.r > 200 && rgb.g > 190 && rgb.b < 160) bright++;
    }
  }
  return total > 0 && bright / total > 0.15;
}

// ---------------------------------------------------------------------------
// Board assembly
// ---------------------------------------------------------------------------

export function parseCanvasBoard(
  canvas: HTMLCanvasElement,
  opts: { direction: "detect" | "N" } = { direction: "detect" },
): Board {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to read the canvas.");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const background = detectBackground(data);
  const grid = detectGrid(data, width, height, background);
  if (!grid) throw new Error("Unable to detect a board grid in the canvas.");
  const samples = analyzeCells(data, width, grid);

  const cells: Board["cells"] = [];
  let starsTotal = 0;
  let robotPos: { x: number; y: number } | null = null;
  for (let row = 0; row < samples.length; row++) {
    cells.push([]);
    for (let col = 0; col < (samples[row]?.length ?? 0); col++) {
      const s = samples[row][col];
      const walkable = s.color !== null || s.isRobot;
      if (s.hasStar) starsTotal++;
      if (s.isRobot) robotPos = { x: col, y: row };
      cells[row].push({
        x: col,
        y: row,
        walkable,
        color: s.color ?? undefined,
        hasStar: s.hasStar,
        isStart: false,
      });
    }
  }

  if (!robotPos) throw new Error("Unable to locate the robot in the canvas.");
  const player: PlayerState = { x: robotPos.x, y: robotPos.y, direction: "N" };
  cells[player.y][player.x].isStart = true;
  return { width: grid.cols, height: grid.rows, cells, player, starsTotal };
}

function pickLargestCanvas(): HTMLCanvasElement | null {
  const canvases = Array.from(document.querySelectorAll("canvas"));
  if (!canvases.length) return null;
  let largest: HTMLCanvasElement | null = null;
  let largestArea = 0;
  for (const c of canvases) {
    const area = c.width * c.height;
    if (area > largestArea) {
      largestArea = area;
      largest = c;
    }
  }
  return largest;
}

export type { Solution, Command };
