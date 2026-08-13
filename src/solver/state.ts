import type { Color, Direction } from "../shared/types";

/**
 * Stable keys used to identify solver/simulation states.
 *
 * The solver memoization is keyed on these strings so that a repeated
 * (function, position, direction, collected-stars, paint-overlay) combination
 * is recognised as already-computed and does not get re-simulated.
 */

export function playerKey(x: number, y: number, dir: Direction): string {
  return `${x},${y}|${dir}`;
}

export function starsKey(stars: Iterable<string>): string {
  const sorted = Array.from(stars).sort();
  return sorted.length ? sorted.join(",") : ".";
}

export function paintsKey(paints: Map<string, Color>): string {
  const entries = Array.from(paints.entries())
    .map(([k, c]) => `${k}:${c}`)
    .sort();
  return entries.length ? entries.join(",") : ".";
}
