import { detectGameAdapter } from "./boardDetector";

/**
 * Watches the page and fires a message to the popup when the current level is
 * solved. Runs cheaply in the background; the transition (unsolved -> solved)
 * is what triggers a notification, so it fires once per level.
 */
export function watchLevelCompletion(): void {
  let previous = false;
  const notify = (payload: { type: string; gameId?: string }) => {
    try {
      void chrome.runtime.sendMessage(payload);
    } catch {
      /* popup closed - nothing to notify */
    }
  };

  setInterval(() => {
    let complete = false;
    let gameId: string | undefined;
    const state = typeof window.__robosolver !== "undefined" ? window.__robosolver?.getState() : null;
    if (state && state.starsMax > 0) {
      complete = state.stars === 0;
    } else {
      try {
        const adapter = detectGameAdapter();
        complete = adapter?.isLevelComplete() ?? false;
      } catch {
        complete = false;
      }
    }
    if (complete && !previous) {
      notify({ type: "LEVEL_COMPLETED", gameId });
    }
    previous = complete;
  }, 500);
}
