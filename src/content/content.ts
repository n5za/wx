import type { AvailableCommands, Board, Solution } from "../shared/types";
import type { GameAdapter } from "../adapters/GameAdapter";
import { detectGameAdapter, describeGame } from "./boardDetector";
import { injectBridge } from "./bridge";
import { solve } from "../solver/solver";
import type { SolverOptions } from "../solver/types";
import { debugBoardToString } from "./boardParser";
import { ExecutionController, padToSlots } from "./commandExecutor";
import type { ExecutionOutcome } from "./commandExecutor";
import { watchLevelCompletion } from "./gameCompletion";

/**
 * Content script: bridges the popup and the game page.
 *
 *  - injects the state bridge into the page's main world (when the DOM looks
 *    like a game),
 *  - detects the best adapter for the current page,
 *  - answers popup messages (analyze / solve / run / pause / resume / stop).
 */

type PopupMessage =
  | { type: "PING" }
  | { type: "ANALYZE" }
  | { type: "SOLVE"; options?: SolverOptions }
  | { type: "RUN"; solution?: Solution; speedMs?: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" }
  | { type: "SET_SPEED"; speedMs: number }
  | { type: "RESET" }
  | { type: "SET_DEBUG"; enabled: boolean };

type PopupResponse =
  | { ok: true; game?: string; board?: Board; available?: AvailableCommands; info?: { gameId?: string; title?: string }; debug?: string; solution?: Solution; message?: string; outcome?: ExecutionOutcome }
  | { ok: false; error: string };

let adapter: GameAdapter | null = null;
let board: Board | null = null;
let available: AvailableCommands | null = null;
let solved: Solution | null = null;
let controller: ExecutionController | null = null;

injectBridge();
if (document.querySelector("#board")) {
  injectBridge();
}
watchLevelCompletion();

chrome.runtime.onMessage.addListener((msg: PopupMessage, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  handleMessage(msg)
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the channel open for the async response
});

async function handleMessage(msg: PopupMessage): Promise<PopupResponse> {
  switch (msg.type) {
    case "PING": {
      const a = resolveAdapter();
      return { ok: true, game: describeGame(a) };
    }

    case "ANALYZE": {
      const a = resolveAdapter();
      board = a.readBoard();
      available = a.readCommands();
      const debug = debugBoardToString(board);
      return {
        ok: true,
        board,
        available,
        info: a.readLevelInfo(),
        debug,
      };
    }

    case "SOLVE": {
      const a = resolveAdapter();
      board ??= a.readBoard();
      available ??= a.readCommands();
      const options = { timeLimitMs: 15_000, ...(msg.options ?? {}) };
      const result = solve(board, available, options);
      if (result.found && result.solution) {
        solved = result.solution;
        return { ok: true, solution: result.solution, message: result.message, board, available };
      }
      return { ok: false, error: result.message };
    }

    case "RUN": {
      const a = resolveAdapter();
      board ??= a.readBoard();
      available ??= a.readCommands();
      const solution = msg.solution ?? solved;
      if (!solution) return { ok: false, error: "No solution. Analyze and solve the level first." };
      solved = solution;

      controller = new ExecutionController(
        {
          adapter: a,
          board,
          solution,
          speedMs: msg.speedMs ?? 250,
          onProgress: (done, total) => {
            try {
              void chrome.runtime.sendMessage({ type: "RUN_PROGRESS", done, total });
            } catch {
              /* popup closed */
            }
          },
        },
        available.functionSlots,
      );
      const outcome = await controller.run();
      controller = null;
      return { ok: true, outcome, message: outcome.message, board, available };
    }

    case "PAUSE": {
      controller?.pause();
      return { ok: true };
    }
    case "RESUME": {
      controller?.resume();
      return { ok: true };
    }
    case "STOP": {
      controller?.stop();
      return { ok: true };
    }
    case "SET_SPEED": {
      resolveAdapter().setSpeed?.(msg.speedMs);
      return { ok: true };
    }
    case "RESET": {
      await resolveAdapter().resetLevel();
      return { ok: true };
    }
    case "SET_DEBUG": {
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown message type." };
  }
}

function resolveAdapter(): GameAdapter {
  if (adapter?.detect()) return adapter;
  adapter = detectGameAdapter();
  if (!adapter) throw new Error("Game not detected. Open a RoboZZle puzzle, then try again.");
  return adapter;
}
