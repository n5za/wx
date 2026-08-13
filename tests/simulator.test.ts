import { describe, expect, it } from "vitest";
import type { Board, Cell, PlayerState, Solution } from "../src/shared/types";
import { simulate } from "../src/solver/simulator";

type Rows = string[];

/** '#': blocked, R/G/B: walkable coloured cells. Stars passed as [x, y]. */
function makeBoard(rows: Rows, start: PlayerState, stars: Array<[number, number]> = []): Board {
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

const E: PlayerState = { x: 0, y: 0, direction: "E" };

function sln(...bodies: Array<Array<{ c: string; cmd: string }>>): Solution {
  return bodies.map((body) =>
    body.map((i) => ({
      condition: (i.c === "any" ? "any" : i.c === "R" ? "red" : i.c === "G" ? "green" : i.c === "B" ? "blue" : i.c.toLowerCase()) as never,
      command: i.cmd as never,
    })),
  );
}

describe("simulate", () => {
  it("moves the robot forward and collects stars", () => {
    const board = makeBoard(["RRRR"], E, [[1, 0], [2, 0], [3, 0]]);
    const run = simulate(sln([{ c: "any", cmd: "FORWARD" }]), board);
    expect(run.status).toBe("programEnded");
    expect(run.finalPlayer).toEqual({ x: 1, y: 0, direction: "E" });
    expect(run.starsCollected).toBe(1);
    expect(run.steps).toBe(1);
  });

  it("wins when the last star is collected", () => {
    const board = makeBoard(["RRRR"], E, [[1, 0], [2, 0], [3, 0]]);
    const run = simulate(
      sln([{ c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }]),
      board,
    );
    expect(run.status).toBe("victory");
    expect(run.starsCollected).toBe(3);
    expect(run.finalPlayer).toEqual({ x: 3, y: 0, direction: "E" });
    expect(run.steps).toBe(2); // the winning move is not counted as fuel
    expect(run.executedSlots).toBe(3);
  });

  it("turns the robot left and right", () => {
    const board = makeBoard(["RRR", "RRR"], E);
    const turnRight = simulate(sln([{ c: "any", cmd: "RIGHT" }]), board);
    expect(turnRight.finalPlayer.direction).toBe("S");
    const turnLeft = simulate(sln([{ c: "any", cmd: "LEFT" }]), board);
    expect(turnLeft.finalPlayer.direction).toBe("N");
  });

  it("crashes when moving off the board", () => {
    const board = makeBoard(["RRR"], E);
    const run = simulate(sln([{ c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }]), board);
    expect(run.status).toBe("crashed");
  });

  it("crashes when moving onto a blocked cell", () => {
    const board = makeBoard(["RR#R"], E);
    const run = simulate(sln([{ c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }]), board);
    expect(run.status).toBe("crashed");
    expect(run.finalPlayer).toEqual({ x: 1, y: 0, direction: "E" });
  });

  it("skips commands whose colour condition does not match", () => {
    // Robot starts on green, RED:FORWARD must be skipped.
    const board = makeBoard(["GRR"], E, [[2, 0]]);
    const run = simulate(
      sln([{ c: "R", cmd: "FORWARD" }, { c: "R", cmd: "FORWARD" }]),
      board,
    );
    expect(run.status).toBe("programEnded");
    expect(run.finalPlayer).toEqual({ x: 0, y: 0, direction: "E" });
    expect(run.steps).toBe(0);
  });

  it("executes colour-conditioned commands on matching cells", () => {
    const board = makeBoard(["GRR"], E, [[2, 0]]);
    const run = simulate(sln([{ c: "G", cmd: "FORWARD" }, { c: "R", cmd: "FORWARD" }]), board);
    expect(run.status).toBe("victory");
    expect(run.finalPlayer).toEqual({ x: 2, y: 0, direction: "E" });
  });

  it("pushes a function frame on CALL and continues from it", () => {
    const board = makeBoard(["RRR"], E, [[2, 0]]);
    const run = simulate(
      sln(
        [{ c: "any", cmd: "CALL_F2" }, { c: "any", cmd: "CALL_F2" }],
        [{ c: "any", cmd: "FORWARD" }],
      ),
      board,
    );
    expect(run.status).toBe("victory");
    expect(run.finalPlayer).toEqual({ x: 2, y: 0, direction: "E" });
    expect(run.executedSlots).toBe(4); // call, fwd, call, fwd
    expect(run.steps).toBe(1); // winning move is not counted as fuel
  });

  it("returns programEnded when the program ends without victory", () => {
    const board = makeBoard(["RRRR"], E, [[3, 0]]);
    const run = simulate(sln([{ c: "any", cmd: "FORWARD" }]), board);
    expect(run.status).toBe("programEnded");
    expect(run.starsCollected).toBe(0);
  });

  it("runs out of fuel after maxSteps actions", () => {
    const board = makeBoard(["R"], E, [[0, 0]]);
    const loop: Array<{ c: string; cmd: string }> = [];
    for (let i = 0; i < 30; i++) loop.push({ c: "any", cmd: "RIGHT" });
    const run = simulate(sln(loop), board, { maxSteps: 10 });
    expect(run.status).toBe("outOfFuel");
    expect(run.steps).toBe(10);
  });

  it("detects infinite recursion", () => {
    const board = makeBoard(["RRR"], E, [[2, 0]]);
    const run = simulate(sln([{ c: "any", cmd: "CALL_F1" }]), board, { maxCallDepth: 500 });
    expect(run.status).toBe("infiniteLoop");
  });

  it("paint changes the colour used by later conditions", () => {
    const board = makeBoard(["RG"], E);
    const run = simulate(
      sln([
        { c: "any", cmd: "PAINT_GREEN" },
        { c: "G", cmd: "FORWARD" },
        { c: "G", cmd: "FORWARD" },
      ]),
      board,
    );
    // After painting the start cell green, the GREEN:FORWARD matches and moves.
    expect(run.finalPlayer).toEqual({ x: 1, y: 0, direction: "E" });
  });

  it("produces one trace entry per executed slot, including skips", () => {
    const board = makeBoard(["GRR"], E, [[2, 0]]);
    const run = simulate(
      sln([{ c: "R", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }, { c: "any", cmd: "FORWARD" }]),
      board,
      { collectTrace: true },
    );
    expect(run.trace).toHaveLength(3);
    // First slot skipped (R on G), so its trace position equals the start.
    expect(run.trace[0]).toMatchObject({ x: 0, y: 0, executed: false });
    expect(run.trace[2]).toMatchObject({ x: 2, y: 0, executed: true });
  });

  it("pops finished functions from the stack (empty trailing slots)", () => {
    const board = makeBoard(["RRR"], E, [[2, 0]]);
    const run = simulate(
      sln(
        [{ c: "any", cmd: "FORWARD" }, { c: "any", cmd: "CALL_F2" }],
        [{ c: "any", cmd: "FORWARD" }],
      ),
      board,
    );
    expect(run.status).toBe("victory");
    expect(run.executedSlots).toBe(3);
    expect(run.steps).toBe(1); // winning move is not counted as fuel
  });
});
