// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  getClass,
  parseBoardSource,
  readCommandsFromDOM,
  readModernBoardSource,
  readProgramFromDOM,
} from "../src/content/boardParser";

function boardHTML(): string {
  return `
  <div id="board">
    <table class="board__grid">
      <tr>
        <td class="board__tile tile -color-R" data-col="0" data-row="0"><div class="tile__item -item-star"></div></td>
        <td class="board__tile tile -color-G" data-col="1" data-row="0"><div class="tile__item"></div></td>
        <td class="board__tile tile" data-col="2" data-row="0"><div class="tile__item"></div></td>
      </tr>
      <tr>
        <td class="board__tile tile -color-B" data-col="0" data-row="1"><div class="tile__item"></div></td>
        <td class="board__tile tile -color-R" data-col="1" data-row="1"><div class="tile__item -item-star"></div></td>
        <td class="board__tile tile -color-R" data-col="2" data-row="1"><div class="tile__item"></div></td>
      </tr>
    </table>
    <div id="robot" style="left: 80px; top: 40px; transform: rotate(90deg)"></div>
  </div>`;
}

function programHTML(): string {
  return `
  <div id="program-list">
    <div class="program-list__item">
      <div class="program-list__condition condition -condition-any">
        <div class="program-list__command command -command-f"></div>
      </div>
      <div class="program-list__condition condition -condition-R">
        <div class="program-list__command command -command-r"></div>
      </div>
      <div class="program-list__condition condition">
        <div class="program-list__command command"></div>
      </div>
    </div>
    <div class="program-list__item">
      <div class="program-list__condition condition -condition-any">
        <div class="program-list__command command -command-1"></div>
      </div>
      <div class="program-list__condition condition -condition-any">
        <div class="program-list__command command"></div>
      </div>
    </div>
  </div>
  <div id="program-toolbar">
    <div class="command program-toolbar__command -command-f"></div>
    <div class="command program-toolbar__command -command-l"></div>
    <div class="command program-toolbar__command -command-r"></div>
    <div class="command program-toolbar__command -command-1"></div>
    <div class="command program-toolbar__command -command-2"></div>
    <div class="command program-toolbar__command -condition-any"></div>
    <div class="command program-toolbar__command -condition-R"></div>
  </div>`;
}

describe("getClass", () => {
  it("reads the -base-value class", () => {
    const div = document.createElement("div");
    div.className = "board__tile tile -color-R";
    expect(getClass(div, "-color")).toBe("R");
    expect(getClass(div, "-item")).toBeNull();
  });
});

describe("readModernBoardSource", () => {
  it("parses cells, stars and the robot from the DOM", () => {
    document.body.innerHTML = boardHTML();
    const source = readModernBoardSource(document);
    expect(source).not.toBeNull();
    expect(source!.cells).toHaveLength(6);
    expect(source!.robot).toEqual({ col: 2, row: 1, dirIndex: 1 });
    const starCells = source!.cells.filter((c) => c.hasStar);
    expect(starCells.map((c) => [c.col, c.row])).toEqual([[0, 0], [1, 1]]);
    const blocked = source!.cells.find((c) => c.col === 2 && c.row === 0)!;
    expect(blocked.walkable).toBe(false);
    expect(blocked.color).toBeUndefined();
  });

  it("returns null when there is no board grid", () => {
    document.body.innerHTML = "<div>no board</div>";
    expect(readModernBoardSource(document)).toBeNull();
  });
});

describe("parseBoardSource", () => {
  it("builds a Board with width, height, player and star count", () => {
    document.body.innerHTML = boardHTML();
    const board = parseBoardSource(readModernBoardSource(document)!);
    expect(board.width).toBe(3);
    expect(board.height).toBe(2);
    expect(board.starsTotal).toBe(2);
    expect(board.player).toEqual({ x: 2, y: 1, direction: "S" });
    expect(board.cells[1]![2]!.isStart).toBe(true);
  });
});

describe("readProgramFromDOM + readCommandsFromDOM", () => {
  it("reads slots and toolbar availability", () => {
    document.body.innerHTML = programHTML();
    const program = readProgramFromDOM(document);
    expect(program).toHaveLength(2);
    expect(program[0]).toEqual([
      { condition: "any", command: "FORWARD" },
      { condition: "red", command: "RIGHT" },
      { condition: "any", command: null },
    ]);
    expect(program[1]![0]).toEqual({ condition: "any", command: "CALL_F1" });

    const commands = readCommandsFromDOM(document);
    expect(commands.commands).toEqual(["FORWARD", "LEFT", "RIGHT", "CALL_F1", "CALL_F2"]);
    expect(commands.functionSlots).toEqual([3, 2]);
    expect(commands.conditions).toEqual(["any", "red"]);
  });
});
