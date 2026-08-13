import { describe, expect, it } from "vitest";
import type { Solution } from "../src/shared/types";
import {
  countCalls,
  countInstructions,
  countMoves,
  functionCallDepth,
  normalizeSolution,
  pickBest,
  scoreSolution,
} from "../src/solver/optimizer";

function body(...instrs: Array<{ condition: string; command: string }>): Solution {
  return [
    instrs.map((i) => ({ condition: i.condition as never, command: i.command as never })),
  ];
}

describe("optimizer", () => {
  it("counts instructions, calls and moves", () => {
    const solution: Solution = [
      [
        { condition: "any", command: "FORWARD" },
        { condition: "red", command: "CALL_F2" },
        { condition: "any", command: null },
      ],
    ];
    expect(countInstructions(solution)).toBe(2);
    expect(countCalls(solution)).toBe(1);
    expect(countMoves(solution)).toBe(1);
  });

  it("normalizes trailing empty slots away", () => {
    const solution: Solution = [
      [
        { condition: "any", command: "FORWARD" },
        { condition: "any", command: null },
        { condition: "any", command: null },
      ],
      [
        { condition: "any", command: null },
        { condition: "any", command: null },
      ],
    ];
    expect(normalizeSolution(solution)).toEqual([[{ condition: "any", command: "FORWARD" }], []]);
  });

  it("keeps interior empty slots", () => {
    const solution: Solution = [
      [
        { condition: "any", command: "FORWARD" },
        { condition: "any", command: null },
        { condition: "any", command: "LEFT" },
      ],
    ];
    const normalized = normalizeSolution(solution);
    expect(normalized[0]!.map((i) => i.command)).toEqual(["FORWARD", null, "LEFT"]);
  });

  it("prefers fewer calls among equal-length solutions", () => {
    const flat = body({ condition: "any", command: "FORWARD" }, { condition: "any", command: "FORWARD" });
    const nested = body({ condition: "any", command: "CALL_F2" }, { condition: "any", command: "FORWARD" });
    const [f2] = [[{ condition: "any", command: "FORWARD" }] as Solution[number]];
    const nestedFull: Solution = [nested[0]!, f2];
    const best = pickBest([nestedFull, flat]);
    expect(best).toEqual(flat);
  });

  it("detects cyclic call graphs", () => {
    const solution: Solution = [
      [{ condition: "any", command: "CALL_F2" }],
      [{ condition: "any", command: "CALL_F1" }],
    ];
    expect(functionCallDepth(solution)).toBe(Infinity);
    expect(scoreSolution(solution).maxDepth).toBe(Infinity);
  });

  it("measures acyclic call depth", () => {
    const solution: Solution = [
      [{ condition: "any", command: "CALL_F2" }],
      [{ condition: "any", command: "CALL_F3" }],
      [{ condition: "any", command: "FORWARD" }],
    ];
    expect(functionCallDepth(solution)).toBe(2);
  });
});
