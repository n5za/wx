import type { Command, FunctionBody, Solution } from "../shared/types";

/**
 * Solution scoring + optimisation helpers.
 *
 * Preference order (from the spec):
 *   1. fewest instructions
 *   2. fewest function calls
 *   3. fewest physical movements
 *   4. minimal recursion
 *   5. avoid unnecessary loops / extra functions
 */

export interface SolutionScore {
  instructions: number;
  calls: number;
  moves: number;
  paints: number;
  maxDepth: number; // Infinity when the call graph is cyclic
  functionsUsed: number;
}

export function countInstructions(solution: Solution): number {
  return solution.reduce((sum, body) => sum + body.filter((i) => i.command !== null).length, 0);
}

export function countCommandType(solution: Solution, predicate: (c: Command) => boolean): number {
  return solution.reduce(
    (sum, body) => sum + body.filter((i) => i.command !== null && predicate(i.command as Command)).length,
    0,
  );
}

export function countCalls(solution: Solution): number {
  return countCommandType(solution, (c) => c.startsWith("CALL_F"));
}

export function countMoves(solution: Solution): number {
  return countCommandType(solution, (c) => c === "FORWARD");
}

export function countPaints(solution: Solution): number {
  return countCommandType(solution, (c) => c.startsWith("PAINT_"));
}

/** Trim trailing empty slots and deep-copy a solution. */
export function normalizeSolution(solution: Solution): Solution {
  return solution.map((body: FunctionBody) => {
    const out: FunctionBody = [];
    for (const instr of body) {
      if (instr.command === null && out.length === 0) continue;
      out.push({ condition: instr.condition, command: instr.command });
    }
    while (out.length && out[out.length - 1].command === null) out.pop();
    return out;
  });
}

/** Longest acyclic path through the function call graph (0 if none, Infinity if cyclic). */
export function functionCallDepth(solution: Solution): number {
  const n = solution.length;
  const graph: number[][] = Array.from({ length: n }, () => []);
  for (let k = 0; k < n; k++) {
    for (const instr of solution[k] ?? []) {
      const m = /^CALL_F(\d+)$/.exec(instr.command ?? "");
      if (m) {
        const j = parseInt(m[1], 10) - 1;
        if (j >= 0 && j < n && j !== k) graph[k].push(j);
      }
    }
  }
  let best = 0;
  const visited: Array<0 | 1 | 2> = new Array(n).fill(0); // 0=unseen 1=in-progress 2=done
  const dfs = (node: number): number => {
    if (visited[node] === 1) {
      best = Infinity;
      return 0;
    }
    if (visited[node] === 2 || best === Infinity) return 0;
    visited[node] = 1;
    let depth = 0;
    for (const next of graph[node]) {
      depth = Math.max(depth, 1 + dfs(next));
    }
    visited[node] = 2;
    return depth;
  };
  for (let k = 0; k < n; k++) {
    if (best === Infinity) break;
    if (graph[k].length) {
      const depth = dfs(k);
      best = Math.max(best, depth);
    }
  }
  return best;
}

export function scoreSolution(solution: Solution): SolutionScore {
  const normalized = normalizeSolution(solution);
  return {
    instructions: countInstructions(normalized),
    calls: countCalls(normalized),
    moves: countMoves(normalized),
    paints: countPaints(normalized),
    maxDepth: functionCallDepth(normalized),
    functionsUsed: normalized.filter((body) => body.some((i) => i.command !== null)).length,
  };
}

function compareScores(a: SolutionScore, b: SolutionScore): number {
  const keys: Array<keyof SolutionScore> = ["instructions", "calls", "moves", "maxDepth", "functionsUsed", "paints"];
  for (const key of keys) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}

export function pickBest(solutions: Solution[]): Solution {
  if (solutions.length === 0) throw new Error("pickBest requires at least one solution");
  let best = solutions[0];
  let bestScore = scoreSolution(best);
  for (let i = 1; i < solutions.length; i++) {
    const score = scoreSolution(solutions[i]);
    if (compareScores(score, bestScore) < 0) {
      best = solutions[i];
      bestScore = score;
    }
  }
  return normalizeSolution(best);
}
