import { describe, expect, it } from "vitest";
import type { Solution } from "../src/shared/types";
import { padToSlots } from "../src/content/commandExecutor";

describe("padToSlots", () => {
  it("pads each function to its slot cap with empty slots", () => {
    const solution: Solution = [[{ condition: "any", command: "FORWARD" }]];
    const padded = padToSlots(solution, [3]);
    expect(padded[0]).toHaveLength(3);
    expect(padded[0]![1]).toEqual({ condition: "any", command: null });
  });

  it("fills missing functions with empty bodies", () => {
    const solution: Solution = [[{ condition: "any", command: "FORWARD" }]];
    const padded = padToSlots(solution, [2, 3]);
    expect(padded).toHaveLength(2);
    expect(padded[1]).toHaveLength(3);
    expect(padded[1]!.every((i) => i.command === null)).toBe(true);
  });

  it("throws when a solution exceeds the slot cap", () => {
    const solution: Solution = [
      [
        { condition: "any", command: "FORWARD" },
        { condition: "any", command: "FORWARD" },
      ],
    ];
    expect(() => padToSlots(solution, [1])).toThrow();
  });

  it("does not mutate the input", () => {
    const solution: Solution = [[{ condition: "any", command: "FORWARD" }]];
    padToSlots(solution, [4]);
    expect(solution[0]).toHaveLength(1);
  });
});
