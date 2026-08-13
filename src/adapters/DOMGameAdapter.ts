import type { AvailableCommands, Board, Command, PlayerState, Solution } from "../shared/types";
import { gameCommandCode, gameConditionCode } from "../shared/types";
import type { GameAdapter } from "./GameAdapter";
import {
  getClass,
  parseBoardSource,
  readCommandsFromDOM,
  readModernBoardSource,
  readProgramFromDOM,
  readProgramSlots,
} from "../content/boardParser";

const CELL_PX = 40;

/**
 * Pure-DOM adapter for the RoboZZle beta client.
 *
 * Everything is read from stable DOM classes/attributes (no pixel coordinates,
 * no screen positions) and everything is written by driving the game's own UI
 * (its program toolbar + slot click handlers), so the game's own validation
 * applies. If the page's global `robozzle` state is also available, prefer
 * `GameStateAdapter`, which wraps this adapter and adds precise state reads.
 */
export class DOMGameAdapter implements GameAdapter {
  readonly kind = "dom" as const;
  protected readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  detect(): boolean {
    const board = this.doc.querySelector("#board");
    return !!board && !!board.querySelector(".board__grid");
  }

  readBoard(): Board {
    const source = readModernBoardSource(this.doc);
    if (!source) throw new Error("Unable to parse board.");
    return parseBoardSource(source);
  }

  readPlayer(): PlayerState {
    return this.readBoard().player;
  }

  readRemainingStars(): number {
    const board = this.doc.getElementById("board");
    if (!board) return 0;
    return board.querySelectorAll('.tile__item[class~="-item-star"]').length;
  }

  readCommands(): AvailableCommands {
    return readCommandsFromDOM(this.doc);
  }

  readLevelInfo(): { gameId?: string; title?: string } {
    const titleEl = this.doc.querySelector("#board-status .board-status__title");
    const title = titleEl?.textContent?.trim() || undefined;
    const match = /[?&]puzzle=([0-9-]+)/.exec(this.doc.location?.search ?? "");
    return { gameId: match ? match[1] : undefined, title };
  }

  async writeProgram(solution: Solution): Promise<void> {
    this.dismissDialogs();
    const slots = readProgramSlots(this.doc);
    if (slots.length === 0) throw new Error("Unable to write program.");

    const expected = encodeExpected(solution);
    for (let k = 0; k < slots.length; k++) {
      const body = solution[k] ?? [];
      for (let i = 0; i < slots[k].length; i++) {
        const instr = body[i];
        const cmdCode = instr?.command ? gameCommandCode(instr.command) : null;
        const condCode = instr?.command ? gameConditionCode(instr.condition) : null;
        this.writeSlot(slots[k][i], condCode, cmdCode);
      }
    }

    const actual = encodeRead(readProgramFromDOM(this.doc));
    if (actual !== expected) {
      throw new Error("Unable to write program into the game.");
    }
  }

  async resetLevel(): Promise<void> {
    this.dismissDialogs();
    const go = this.doc.getElementById("program-go") as HTMLButtonElement | null;
    const step = this.doc.getElementById("program-step") as HTMLButtonElement | null;
    if (!go) throw new Error("Game not detected.");

    const finished = step ? step.disabled : go.textContent?.trim() === "Reset";
    if (finished) {
      go.click();
      return;
    }

    // Idle game at its start position: nothing to reset. A running game cannot
    // be stopped reliably from the DOM, so ask the user to reset it manually.
    if (!this.isRunning()) return;

    throw new Error(
      "Unable to reset the level reliably. Click Go! in the game until it resets, then re-analyze.",
    );
  }

  async stepOnce(): Promise<void> {
    const step = this.doc.getElementById("program-step") as HTMLButtonElement | null;
    if (step && !step.disabled) step.click();
  }

  async runProgram(): Promise<void> {
    const go = this.doc.getElementById("program-go") as HTMLButtonElement | null;
    if (go) go.click();
  }

  isLevelComplete(): boolean {
    if (this.isVisible(this.doc.getElementById("dialog-solved"))) return true;
    const total = this.readBoard().starsTotal;
    const remaining = this.readRemainingStars();
    return total > 0 && remaining === 0;
  }

  isRunning(): boolean {
    const step = this.doc.getElementById("program-step") as HTMLButtonElement | null;
    const go = this.doc.getElementById("program-go");
    if (step?.disabled) return false;
    if (go?.textContent?.trim() === "Reset") return false;
    // Mid-run the game highlights the current command with -program-highlight.
    return !!this.doc.querySelector("#program-list .-program-highlight");
  }

  setSpeed(ms: number): void {
    const slider = this.doc.getElementById("program-speed") as HTMLInputElement | null;
    if (slider) slider.value = String(Math.round(Math.max(0, Math.min(10, 10 - Math.cbrt(Math.max(10, ms) - 20)))));
  }

  isIdle(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async executeCommand(command: Command): Promise<void> {
    const slots = readProgramSlots(this.doc);
    const f1 = slots[0];
    if (!f1) throw new Error("Unable to write program.");
    const slot = f1.find((s) => getClass(s, "-condition") === null) ?? f1[f1.length - 1];
    this.dismissDialogs();
    this.writeSlot(slot, null, gameCommandCode(command));
  }

  debugDump(): unknown {
    return {
      board: readModernBoardSource(this.doc),
      program: readProgramFromDOM(this.doc),
      slots: readProgramSlots(this.doc).map((s) => s.length),
      goText: this.doc.getElementById("program-go")?.textContent,
      stepDisabled: (this.doc.getElementById("program-step") as HTMLButtonElement | null)?.disabled,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  protected isVisible(el: Element | null): boolean {
    if (!el) return false;
    const style = (el as HTMLElement).style;
    if (style.display && style.display !== "none") return true;
    const modal = this.doc.getElementById("dialog-modal") as HTMLElement | null;
    if (modal && modal.style.display && modal.style.display !== "none") {
      if (el.classList.contains("dialog")) return true;
    }
    return false;
  }

  protected dismissDialogs(): void {
    const solved = this.doc.getElementById("dialog-solved");
    if (this.isVisible(solved)) {
      this.clickById("dialog-solved-replay");
      return;
    }
    const message = this.doc.getElementById("dialog-message");
    if (this.isVisible(message)) {
      this.clickById("dialog-message-ok");
    }
  }

  protected clickById(id: string): void {
    const el = this.doc.getElementById(id);
    if (el) (el as HTMLElement).click();
  }

  protected findToolbarCommand(code: string): HTMLElement | null {
    return this.doc.querySelector(`#program-toolbar .command[class~="-command-${code}"]`) as HTMLElement | null;
  }

  protected findToolbarCondition(code: string): HTMLElement | null {
    return this.doc.querySelector(`#program-toolbar .command[class~="-condition-${code}"]`) as HTMLElement | null;
  }

  protected clearSelection(): void {
    const board = this.doc.getElementById("board");
    if (board) board.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  /**
   * Write one slot using the game's own UI: clear, then select the command
   * from the toolbar and click the slot, then (optionally) the condition.
   */
  protected writeSlot(slot: Element, condCode: string | null, cmdCode: string | null): void {
    this.clearSelection();
    (slot as HTMLElement).click();

    if (cmdCode) {
      const cmdBtn = this.findToolbarCommand(cmdCode);
      if (!cmdBtn) throw new Error(`Command ${cmdCode} is not available for this level.`);
      cmdBtn.click();
      (slot as HTMLElement).click();

      if (condCode && condCode !== "any") {
        const condBtn = this.findToolbarCondition(condCode);
        if (!condBtn) throw new Error(`Condition ${condCode} is not available for this level.`);
        condBtn.click();
        (slot as HTMLElement).click();
      }
    }
  }
}

function encodeExpected(solution: Solution): string {
  const parts: string[] = [];
  for (let k = 0; k < solution.length; k++) {
    for (const instr of solution[k] ?? []) {
      if (!instr.command) {
        parts.push("-");
        continue;
      }
      parts.push(`${gameConditionCode(instr.condition)}/${gameCommandCode(instr.command)}`);
    }
    parts.push("|");
  }
  return parts.join("");
}

function encodeRead(solution: Solution): string {
  const parts: string[] = [];
  for (let k = 0; k < solution.length; k++) {
    for (const instr of solution[k] ?? []) {
      if (!instr.command) {
        parts.push("-");
        continue;
      }
      parts.push(`${gameConditionCode(instr.condition)}/${gameCommandCode(instr.command)}`);
    }
    parts.push("|");
  }
  return parts.join("");
}
