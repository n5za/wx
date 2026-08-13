import { describe, expect, it } from "vitest";
import type { AvailableCommands, Board, Cell, PlayerState, Solution } from "../src/shared/types";
import { countInstructions } from "../src/solver/optimizer";
import { solve } from "../src/solver/solver";
import { simulate } from "../src/solver/simulator";

function makeBoard(rows: string[], start: PlayerState, stars: Array<[number, number]> = []): Board {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const cells: Cell[][] = [];
  let starsTotal = 0;
  for (let y = 0; y < height; y++) {
    cells.push([]);
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      const color = ch === "R" ? "red" : ch === "G" ? "green" : ch === "B" ? "blue" : undefined;
      const walkable = color !== undefined;
      const hasStar = stars.some(([sx, sy]) => sx === x && sy === y);
      if (hasStar) starsTotal++;
      cells[y].push({ x, y, walkable, color, hasStar, isStart: x === start.x && y === start.y });
    }
  }
  return { width, height, cells, player: start, starsTotal };
}

function avail(caps: number[], commands: AvailableCommands["commands"]): AvailableCommands {
  return { functionSlots: caps, commands, conditions: ["any", "red", "green", "blue"] };
}

const E: PlayerState = { x: 0, y: 0, direction: "E" };

describe("solve", () => {
  it("finds the straight-forward solution", () => {
    const board = makeBoard(["RRRR"], E, [[1, 0], [2, 0], [3, 0]]);
    const result = solve(board, avail([3], ["FORWARD"]));
    expect(result.found).toBe(true);
    expect(countInstructions(result.solution!)).toBeLessThanOrEqual(3);
    const run = simulate(result.solution!, board);
    expect(run.status).toBe("victory");
  });

  it("finds a turn + forward solution", () => {
    const board = makeBoard(["RRR", "RRR"], E, [[2, 1]]);
    const result = solve(board, avail([5], ["FORWARD", "RIGHT"]));
    expect(result.found).toBe(true);
    const run = simulate(result.solution!, board);
    expect(run.status).toBe("victory");
    expect(countInstructions(result.solution!)).toBe(4);
  });

  it("uses calls when the function is too short for the whole path", () => {
    const board = makeBoard(["RRRRR"], E, [[1, 0], [2, 0], [3, 0], [4, 0]]);
    const result = solve(board, avail([1, 4], ["FORWARD"]));
    expect(result.found).toBe(true);
    const run = simulate(result.solution!, board);
    expect(run.status).toBe("victory");
    // F1 has a single slot, so it must call F2 to cover the 4-cell path.
    const body = result.solution![0]!;
    expect(body.some((i) => i.command === "CALL_F2")).toBe(true);
  });

  it("returns not found for an unreachable star", () => {
    const board = makeBoard(["R#R"], E, [[2, 0]]);
    const result = solve(board, avail([6], ["FORWARD"]), { timeLimitMs: 3000 });
    expect(result.found).toBe(false);
  });

  it("respects the time limit", () => {
    const board = makeBoard(["RRRR", "RRRR", "RRRR", "RRRR"], E, [[3, 3]]);
    const result = solve(board, avail([10], ["FORWARD", "LEFT", "RIGHT"]), { timeLimitMs: 1 });
    expect(result.found).toBe(false);
  });

  it("never returns a solution with unused (unreachable) functions", () => {
    const board = makeBoard(["RRRR"], E, [[1, 0], [2, 0], [3, 0]]);
    const result = solve(board, avail([3, 3], ["FORWARD"]));
    expect(result.found).toBe(true);
    for (let k = 0; k < result.solution!.length; k++) {
      const body = result.solution![k]!;
      if (k > 0 && body.some((i) => i.command !== null)) {
        // F2..F5 must be called somewhere, or the reachability prune removed it.
        const calls = result
          .solution!.flatMap((b) => b)
          .some((i) => i.command === `CALL_F${k + 1}`);
        expect(calls).toBe(true);
      }
    }
  });

  it("respects condition availability from the level", () => {
    const board = makeBoard(["GRR"], E, [[2, 0]]);
    const result = solve(board, avail([4], ["FORWARD"]));
    expect(result.found).toBe(true);
    const run = simulate(result.solution!, board);
    expect(run.status).toBe("victory");
  });
});
