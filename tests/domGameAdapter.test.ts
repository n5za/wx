// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DOMGameAdapter } from "../src/adapters/DOMGameAdapter";

function gameHTML(goText: string, stepDisabled: boolean, running: boolean): string {
  return `
  <div id="program-list">${running ? '<div class="-program-highlight"></div>' : ""}</div>
  <button id="program-go">${goText}</button>
  <button id="program-step" ${stepDisabled ? "disabled" : ""}>Step</button>
  <div id="dialog-modal" style="display:none"></div>
  <div id="dialog-solved" style="display:none"></div>
  <div id="dialog-message" style="display:none"></div>
  `;
}

describe("DOMGameAdapter.resetLevel", () => {
  it("leaves a fresh idle game alone", async () => {
    document.body.innerHTML = gameHTML("Go!", false, false);
    const adapter = new DOMGameAdapter(document);
    const go = document.getElementById("program-go")!;
    const spy = vi.spyOn(go, "click");
    await expect(adapter.resetLevel()).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not reject a fresh level whose start direction is not East", async () => {
    document.body.innerHTML = gameHTML("Go!", false, false);
    const adapter = new DOMGameAdapter(document);
    await expect(adapter.resetLevel()).resolves.toBeUndefined();
  });

  it("clicks Go! when the game is in the finished/Reset state", async () => {
    document.body.innerHTML = gameHTML("Reset", true, false);
    const adapter = new DOMGameAdapter(document);
    const go = document.getElementById("program-go")!;
    const spy = vi.spyOn(go, "click");
    await adapter.resetLevel();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rejects when the game is mid-run and cannot be stopped from the DOM", async () => {
    document.body.innerHTML = gameHTML("Go!", false, true);
    const adapter = new DOMGameAdapter(document);
    await expect(adapter.resetLevel()).rejects.toThrow(/Unable to reset the level reliably/);
  });

  it("detects a running game from the command highlight", () => {
    document.body.innerHTML = gameHTML("Go!", false, true);
    expect(new DOMGameAdapter(document).isRunning()).toBe(true);
    document.body.innerHTML = gameHTML("Go!", false, false);
    expect(new DOMGameAdapter(document).isRunning()).toBe(false);
  });
});
