import { DOMGameAdapter } from "../adapters/DOMGameAdapter";
import { GameStateAdapter } from "../adapters/GameStateAdapter";
import { CanvasGameAdapter } from "../adapters/CanvasGameAdapter";
import type { GameAdapter } from "../adapters/GameAdapter";

/**
 * Chooses the most reliable adapter for the current page.
 *
 * 1. `state`  - exact `robozzle` page state via the injected bridge (preferred),
 * 2. `dom`    - the RoboZZle beta client DOM structure,
 * 3. `canvas` - pixel analysis, only when nothing else matched.
 */
export function detectGameAdapter(): GameAdapter | null {
  const state = new GameStateAdapter();
  if (state.detect()) return state;

  const dom = new DOMGameAdapter();
  if (dom.detect()) return dom;

  const canvas = new CanvasGameAdapter();
  if (canvas.detect()) return canvas;

  return null;
}

export function describeGame(adapter: GameAdapter | null): string {
  if (!adapter) return "none";
  return adapter.kind;
}
