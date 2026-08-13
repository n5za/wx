import type { Command, Condition, Solution } from "./types";

/** Compact glyph used in the popup/debug output. */
export function commandGlyph(command: Command): string {
  switch (command) {
    case "FORWARD":
      return "↑";
    case "LEFT":
      return "↰";
    case "RIGHT":
      return "↱";
    case "CALL_F1":
      return "F1";
    case "CALL_F2":
      return "F2";
    case "CALL_F3":
      return "F3";
    case "CALL_F4":
      return "F4";
    case "CALL_F5":
      return "F5";
    case "PAINT_RED":
      return "PR";
    case "PAINT_GREEN":
      return "PG";
    case "PAINT_BLUE":
      return "PB";
  }
}

export function conditionLabel(condition: Condition): string {
  return condition === "any" ? "" : condition.toUpperCase();
}

/** "F1: RED:↑ ↑ ↰  F2: F1 F1" style rendering. */
export function solutionToText(solution: Solution): string[] {
  return solution.map((body, i) => {
    const parts: string[] = [];
    for (const instr of body) {
      if (!instr.command) {
        parts.push("·");
        continue;
      }
      const cond = conditionLabel(instr.condition);
      const glyph = commandGlyph(instr.command);
      parts.push(cond ? `${cond}:${glyph}` : glyph);
    }
    return `F${i + 1}: ${parts.join(" ")}`;
  });
}

export function solutionToCompact(solution: Solution): string {
  return solutionToText(solution)
    .filter((line) => !line.endsWith(":"))
    .join(" | ");
}
