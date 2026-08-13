import type { AvailableCommands, Board, Solution } from "../shared/types";
import type { ExecutionOutcome } from "../content/commandExecutor";

/**
 * Popup UI for the extension.
 *
 * Talks to the content script via `chrome.tabs.sendMessage` and renders the
 * result (board info, solution, progress, debug output).
 */

const SPEED_PRESETS = [50, 100, 250, 500, 1000];

interface AnalyzeInfo {
  board: Board;
  available: AvailableCommands;
  info: { gameId?: string; title?: string };
  debug: string;
}

type ErrorResponse = { ok: false; error: string };
type PingResponse = { ok: true; game?: string };
type AnalyzeResponse = AnalyzeInfo & { ok: true } | ErrorResponse;
type SolveResponse = { ok: true; solution: Solution; message: string } | ErrorResponse;
type RunResponse = { ok: true; outcome: ExecutionOutcome; message: string } | ErrorResponse;

let activeTabId: number | null = null;
let speedMs = 250;
let analyzing = false;
let running = false;
let debugOn = false;
let analyzeInfo: AnalyzeInfo | null = null;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

init();

async function init(): Promise<void> {
  bindButtons();

  const stored = await chrome.storage.local.get("speedMs");
  if (typeof stored.speedMs === "number" && SPEED_PRESETS.includes(stored.speedMs)) {
    speedMs = stored.speedMs;
  }
  setSpeedSlider(speedMs);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    activeTabId = tab.id;
    const res = await send<PingResponse>(tab.id, { type: "PING" });
    if (res?.ok) {
      setStatus(`Ready - ${res.game ?? "game"} detected`);
    } else {
      setStatus("Game not detected");
    }
  } else {
    setStatus("No active tab");
  }
}

function bindButtons(): void {
  $("analyze").addEventListener("click", onAnalyze);
  $("run").addEventListener("click", onRun);
  $("pause").addEventListener("click", () => void send(activeTabId, { type: "PAUSE" }));
  $("resume").addEventListener("click", () => void send(activeTabId, { type: "RESUME" }));
  $("stop").addEventListener("click", () => void send(activeTabId, { type: "STOP" }));

  const speed = $<HTMLInputElement>("speed");
  speed.addEventListener("input", () => {
    speedMs = SPEED_PRESETS[Number(speed.value)] ?? 250;
    setSpeedSlider(speedMs);
    void chrome.storage.local.set({ speedMs });
    void send(activeTabId, { type: "SET_SPEED", speedMs });
  });

  const debug = $<HTMLInputElement>("debug");
  debug.addEventListener("change", () => {
    debugOn = debug.checked;
    renderDebug();
    void send(activeTabId, { type: "SET_DEBUG", enabled: debugOn });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "RUN_PROGRESS") {
      updateProgress(msg.done, msg.total);
    } else if (msg?.type === "LEVEL_COMPLETED") {
      setMessage("Level completed!", true);
    }
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function onAnalyze(): Promise<void> {
  if (!activeTabId) return setMessage("No active tab.");
  setMessage("");
  analyzing = true;
  setStatus("Analyzing...");
  try {
    const res = await send<AnalyzeResponse>(activeTabId, { type: "ANALYZE" });
    if (!res?.ok) {
      setStatus("Failed");
      return setMessage(res?.error ?? "Game not detected.");
    }
    analyzeInfo = res;
    renderBoardInfo(res.board);
    renderDebug();
    setStatus(`Analyzed - ${res.info?.title ?? "level"}`);
    $<HTMLButtonElement>("run").disabled = false;
    if (res.board.starsTotal > 0) {
      $("stars").textContent = `0 / ${res.board.starsTotal}`;
    }
  } finally {
    analyzing = false;
  }
}

async function onRun(): Promise<void> {
  if (!activeTabId) return setMessage("No active tab.");
  setMessage("");
  running = true;
  setRunningState(true);
  setStatus("Solving...");
  try {
    const solveRes = await send<SolveResponse>(activeTabId, { type: "SOLVE" });
    if (!solveRes?.ok) {
      setStatus("Failed");
      setMessage(solveRes?.error ?? "No solution found.");
      return;
    }
    const solution: Solution = solveRes.solution;
    renderSolution(solution);

    setStatus("Executing...");
    const runRes = await send<RunResponse>(activeTabId, { type: "RUN", solution, speedMs });
    if (!runRes?.ok) {
      setStatus("Failed");
      setMessage(runRes?.error ?? "Execution failed.");
      return;
    }
    const outcome: ExecutionOutcome = runRes.outcome;
    setMessage(outcome.message, outcome.success);
    setStatus(outcome.success ? "Solved" : "Not solved");
    if (outcome.success && analyzeInfo) {
      $("stars").textContent = `${analyzeInfo.board.starsTotal} / ${analyzeInfo.board.starsTotal}`;
    }
  } finally {
    running = false;
    setRunningState(false);
    setStatus("Ready");
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBoardInfo(board: Board): void {
  $("board-size").textContent = `${board.width} x ${board.height}`;
  $("stars").textContent = `0 / ${board.starsTotal}`;
  renderBoard(board);
}

function renderBoard(board: Board): void {
  const container = $("board-render");
  container.innerHTML = "";
  container.hidden = !debugOn;
  if (!debugOn) return;
  const table = document.createElement("table");
  const colors: Record<string, string> = {
    red: "#e5534b",
    green: "#3aa76d",
    blue: "#4a7bd6",
  };
  const dirGlyph = { N: "^", E: ">", S: "v", W: "<" };
  for (let y = 0; y < board.height; y++) {
    const tr = document.createElement("tr");
    for (let x = 0; x < board.width; x++) {
      const td = document.createElement("td");
      const cell = board.cells[y][x];
      if (x === board.player.x && y === board.player.y) {
        td.textContent = dirGlyph[board.player.direction];
        td.style.background = "#f6d55c";
      } else if (!cell.walkable) {
        td.style.background = "#3b4654";
      } else {
        td.style.background = colors[cell.color ?? "blue"] ?? "#fff";
        if (cell.hasStar) td.textContent = "*";
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  container.appendChild(table);
}

function renderSolution(solution: Solution): void {
  const section = $("solution-section");
  section.hidden = false;
  $("solution").textContent = solutionToText(solution);
}

function solutionToText(solution: Solution): string {
  return solution
    .map((body, k) => {
      const head = `F${k + 1}: `;
      const cmds = body
        .filter((instr) => instr.command !== null)
        .map((instr) => `${instr.condition === "any" ? "" : instr.condition + " "}${instr.command}`);
      return cmds.length ? head + cmds.join(", ") : head + "(empty)";
    })
    .join("\n");
}

function renderDebug(): void {
  const panel = $("debug-panel");
  panel.hidden = !debugOn;
  if (!debugOn || !analyzeInfo) return;
  const { board, available, info, debug } = analyzeInfo;
  const lines = [
    `Game: ${info.gameId ?? "-"}`,
    `Title: ${info.title ?? "-"}`,
    `Board: ${board.width} x ${board.height}`,
    `Stars: ${board.starsTotal}`,
    `Start: (${board.player.x}, ${board.player.y}) ${board.player.direction}`,
    `Functions: ${available.functionSlots.join(", ")}`,
    `Commands: ${available.commands.join(", ")}`,
    `Conditions: ${available.conditions.join(", ")}`,
    ``,
    debug,
  ];
  panel.textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(text: string): void {
  $("status").textContent = text;
}

function setMessage(text: string, ok = false): void {
  const el = $("message");
  el.textContent = text;
  el.className = ok ? "message ok" : "message";
}

function setSpeedSlider(ms: number): void {
  const idx = Math.max(0, SPEED_PRESETS.indexOf(ms));
  $<HTMLInputElement>("speed").value = String(idx);
  $("speed-label").textContent = `${ms} ms`;
}

function updateProgress(done: number, total: number): void {
  const progress = $("progress");
  progress.hidden = false;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $("progress-bar").style.width = `${pct}%`;
  $("progress-label").textContent = `${done} / ${total} commands (${pct}%)`;
}

function setRunningState(run: boolean): void {
  $<HTMLButtonElement>("run").disabled = run || !analyzeInfo;
  $<HTMLButtonElement>("pause").disabled = !run;
  $<HTMLButtonElement>("resume").disabled = !run;
  $<HTMLButtonElement>("stop").disabled = !run;
  if (!run) {
    $("progress").hidden = true;
  }
}

async function send<T = unknown>(tabId: number | null, msg: unknown): Promise<T | null> {
  if (tabId == null) return null;
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  } catch {
    return null;
  }
}
