import {
  AvailableCommands,
  Board,
  Cell,
  Color,
  Command,
  Condition,
  PlayerState,
  Solution,
  colorFromGameChar,
  commandFromGameCode,
  conditionFromGameCode,
  directionFromGameIndex,
} from "../shared/types";
import type { RoboLevelData } from "../adapters/bridgeApi";

/**
 * Board parsing.
 *
 * The primary parser reads the real game's DOM (the RoboZZle beta client):
 *
 *   #board > table.board__grid > tr > td.board__tile.tile[data-col][data-row]
 *     └─ div.tile__item (class "-item-star" when it holds a star)
 *
 * Walkable cells carry a colour class like "-color-R". Cells with no colour are
 * blocked. The robot is the absolutely positioned "#robot" element (left/top in
 * px at 40px per cell, transform rotate(dir*90deg)).
 *
 * A secondary parser builds a Board straight from the game's data strings
 * (level.Colors / level.Items) when the page state bridge is available.
 *
 * The parser itself is DOM-agnostic: everything reads through small helpers, so
 * the same parse logic is unit-tested with both real-ish DOM (jsdom) and plain
 * objects.
 */

// ---------------------------------------------------------------------------
// Generic DOM helpers
// ---------------------------------------------------------------------------

export interface ClassedElement {
  className?: string;
  getAttribute(name: string): string | null;
  querySelector?<E = unknown>(selectors: string): E | null;
  querySelectorAll?<E = unknown>(selectors: string): ArrayLike<E>;
}

export function getClass(el: ClassedElement, base: string): string | null {
  const className = el.className ?? "";
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\s)${escaped}-([A-Za-z0-9]+)`, "g");
  const m = re.exec(className);
  return m ? m[2] : null;
}

export function hasClass(el: ClassedElement, cls: string): boolean {
  const className = el.className ?? "";
  return className.split(/\s+/).includes(cls);
}

// ---------------------------------------------------------------------------
// Source extraction (DOM -> structured descriptors)
// ---------------------------------------------------------------------------

export interface RobotSource {
  col: number;
  row: number;
  dirIndex: number;
}

export interface CellSource {
  col: number;
  row: number;
  color?: Color;
  hasStar: boolean;
  walkable: boolean;
}

export interface BoardSource {
  cells: CellSource[];
  robot: RobotSource | null;
}

export function readModernBoardSource(doc: Document): BoardSource | null {
  const grid = doc.querySelector("#board .board__grid");
  if (!grid) return null;

  const cells: CellSource[] = [];
  for (const td of Array.from(grid.querySelectorAll("td.board__tile"))) {
    const col = parseInt(td.getAttribute("data-col") ?? "", 10);
    const row = parseInt(td.getAttribute("data-row") ?? "", 10);
    if (Number.isNaN(col) || Number.isNaN(row)) continue;
    const colorClass = getClass(td, "-color");
    const item = td.querySelector(".tile__item");
    const hasStar = !!item && getClass(item, "-item") === "star";
    cells.push({
      col,
      row,
      color: colorFromGameChar(colorClass),
      hasStar,
      walkable: colorClass !== null,
    });
  }

  let robot: RobotSource | null = null;
  const robotEl = doc.getElementById("robot");
  if (robotEl) {
    const style = robotEl.style;
    const left = parseFloat(style?.left ?? "");
    const top = parseFloat(style?.top ?? "");
    const transform = style?.transform ?? "";
    const rot = /rotate\(([-0-9.]+)deg\)/.exec(transform);
    const deg = rot ? parseFloat(rot[1]) : 0;
    const dirIndex = (((Math.round(deg / 90) % 4) + 4) % 4);
    robot = { col: Math.round(left / 40), row: Math.round(top / 40), dirIndex };
  }

  if (cells.length === 0) return null;
  return { cells, robot };
}

// ---------------------------------------------------------------------------
// Structured source -> Board
// ---------------------------------------------------------------------------

export function parseBoardSource(src: BoardSource): Board {
  let width = 0;
  let height = 0;
  for (const c of src.cells) {
    if (c.col + 1 > width) width = c.col + 1;
    if (c.row + 1 > height) height = c.row + 1;
  }
  if (width === 0 || height === 0) throw new Error("Unable to parse board.");

  const grid: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    grid.push([]);
    for (let x = 0; x < width; x++) {
      grid[y].push({ x, y, walkable: false, hasStar: false, isStart: false });
    }
  }

  let starsTotal = 0;
  for (const c of src.cells) {
    const cell = grid[c.row][c.col];
    cell.walkable = c.walkable;
    cell.color = c.color;
    cell.hasStar = c.hasStar;
    if (c.hasStar) starsTotal++;
  }

  const player = src.robot
    ? { x: src.robot.col, y: src.robot.row, direction: directionFromGameIndex(src.robot.dirIndex) }
    : null;
  if (!player) throw new Error("Unable to parse board.");

  const startCell = grid[player.y]?.[player.x];
  if (!startCell || !startCell.walkable) throw new Error("Unable to parse board.");
  startCell.isStart = true;

  return { width, height, cells: grid, player, starsTotal };
}

export function parseFromLevelData(level: RoboLevelData): Board {
  const rows = level.Colors;
  const items = level.Items;
  if (!rows || !items || rows.length !== items.length || rows.length === 0) {
    throw new Error("Unable to parse board.");
  }
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const grid: Cell[][] = [];
  let starsTotal = 0;

  for (let y = 0; y < height; y++) {
    grid.push([]);
    for (let x = 0; x < width; x++) {
      const colorChar = rows[y]?.charAt(x) ?? "";
      const itemChar = items[y]?.charAt(x) ?? "";
      const color = colorFromGameChar(colorChar);
      const walkable = color !== undefined;
      const hasStar = walkable && itemChar === "*";
      if (hasStar) starsTotal++;
      grid[y].push({ x, y, walkable, color, hasStar, isStart: false });
    }
  }

  const player: PlayerState = {
    x: Number(level.RobotCol),
    y: Number(level.RobotRow),
    direction: directionFromGameIndex(Number(level.RobotDir)),
  };
  const startCell = grid[player.y]?.[player.x];
  if (startCell?.walkable) startCell.isStart = true;

  return { width, height, cells: grid, player, starsTotal };
}

// ---------------------------------------------------------------------------
// Program + commands
// ---------------------------------------------------------------------------

export function readProgramSlots(doc: Document): Element[][] {
  const items = Array.from(doc.querySelectorAll("#program-list .program-list__item"));
  return items.map((item) => Array.from(item.querySelectorAll(".program-list__condition")));
}

export function readProgramSlotsCounts(doc: Document): number[] {
  return readProgramSlots(doc).map((slots) => slots.length);
}

export function readProgramFromDOM(doc: Document): Solution {
  return readProgramSlots(doc).map((slots) =>
    slots.map((slot) => {
      const cond = getClass(slot, "-condition");
      const cmdEl = slot.querySelector<Element>(".program-list__command");
      const cmd = cmdEl ? getClass(cmdEl, "-command") : null;
      return { condition: conditionFromGameCode(cond), command: commandFromGameCode(cmd) };
    }),
  );
}

export function readCommandsFromDOM(doc: Document): AvailableCommands {
  const codeOrder = ["f", "l", "r", "1", "2", "3", "4", "5", "R", "G", "B"];
  const commands: Command[] = [];
  for (const code of codeOrder) {
    if (doc.querySelector(`#program-toolbar .command[class~="-command-${code}"]`)) {
      const cmd = commandFromGameCode(code);
      if (cmd) commands.push(cmd);
    }
  }

  const condCodes = ["any", "R", "G", "B"];
  const conditions: Condition[] = [];
  for (const code of condCodes) {
    if (doc.querySelector(`#program-toolbar .command[class~="-condition-${code}"]`)) {
      conditions.push(conditionFromGameCode(code));
    }
  }
  if (conditions.length === 0) conditions.push("any");

  return { commands, functionSlots: readProgramSlotsCounts(doc), conditions };
}

// ---------------------------------------------------------------------------
// Debug rendering
// ---------------------------------------------------------------------------

export function debugBoardToString(board: Board): string {
  const lines: string[] = [];
  for (let y = 0; y < board.height; y++) {
    let line = "";
    for (let x = 0; x < board.width; x++) {
      const cell = board.cells[y]?.[x];
      if (x === board.player.x && y === board.player.y) {
        const glyph = { N: "^", E: ">", S: "v", W: "<" }[board.player.direction];
        line += glyph;
      } else if (!cell?.walkable) {
        line += "#";
      } else if (cell.hasStar) {
        line += "*";
      } else {
        line += { red: "R", green: "G", blue: "B" }[cell.color ?? "red"] ?? "?";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}
