/**
 * Main-world bridge installation.
 *
 * This file is bundled as `dist/bridge.js` and registered in the manifest as a
 * content script with `world: "MAIN"`, so it runs in the page's main world
 * (where the game's `window.robozzle` global lives) without needing an inline
 * `<script>` tag. Inline script injection is blocked on pages whose Content
 * Security Policy lacks `unsafe-inline`, so this manifest-based installation is
 * the primary mechanism; `injectBridge()` in bridge.ts is only a fallback.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
interface RoboZZleGame {
  level?: any;
  program?: any;
  robotCol?: number;
  robotRow?: number;
  robotDir?: number;
  stars?: number;
  starsMax?: number;
  steps?: number;
  robotState?: number;
  robotDelay?: number;
  stepReset?: () => void;
  updatePuzzleUrl?: () => void;
}

declare global {
  interface Window {
    robozzle?: RoboZZleGame;
  }
}

function game(): RoboZZleGame | null {
  try {
    return window.robozzle || null;
  } catch {
    return null;
  }
}

function getClassValue(el: Element | null, prefix: string): string | null {
  if (!el) return null;
  const classes = el.className ? String(el.className).split(/\s+/) : [];
  for (const cls of classes) {
    if (cls.indexOf(prefix + "-") === 0) return cls.slice(prefix.length + 1);
  }
  return null;
}

function setClassValue(el: Element, prefix: string, value: string): void {
  const classes = el.className ? String(el.className).split(/\s+/) : [];
  const out: string[] = [];
  for (const cls of classes) {
    if (cls.indexOf(prefix + "-") === 0) continue;
    out.push(cls);
  }
  if (value) out.push(prefix + "-" + value);
  el.className = out.join(" ");
}

if (!(window as any).__robosolver) {
  (window as any).__robosolver = {
    version: 1,

    present: () => !!game(),

    getLevel: () => {
      const r = game();
      if (!r || !r.level) return null;
      const L = r.level;
      return {
        Id: L.Id,
        Title: L.Title,
        Colors: L.Colors,
        Items: L.Items,
        RobotRow: L.RobotRow,
        RobotCol: L.RobotCol,
        RobotDir: L.RobotDir,
        AllowedCommands: L.AllowedCommands,
        SubLengths: L.SubLengths,
        DisallowSubs: L.DisallowSubs,
        DisallowColors: L.DisallowColors,
      };
    },

    getState: () => {
      const r = game();
      if (!r) return null;
      return {
        robotCol: r.robotCol,
        robotRow: r.robotRow,
        robotDir: r.robotDir,
        stars: r.stars,
        starsMax: r.starsMax,
        steps: r.steps,
        robotState: r.robotState,
      };
    },

    readProgram: () => {
      const r = game();
      if (!r || !r.program) return null;
      const out: Array<Array<[string | null, string | null]>> = [];
      for (let j = 0; j < r.program.length; j++) {
        const sub = r.program[j] || [];
        const row: Array<[string | null, string | null]> = [];
        for (let i = 0; i < sub.length; i++) {
          const el: Element | null = sub[i] ? sub[i][0] : null;
          const cmdEl = el ? el.querySelector(".program-list__command") : null;
          row.push([getClassValue(el, "-condition"), cmdEl ? getClassValue(cmdEl, "-command") : null]);
        }
        out.push(row);
      }
      return out;
    },

    setProgram: (program: Array<Array<[string | null, string | null] | null>>) => {
      const r = game();
      if (!r || !r.program) return false;
      for (let j = 0; j < r.program.length; j++) {
        const sub = r.program[j] || [];
        const sol = program && program[j] ? program[j] : [];
        for (let i = 0; i < sub.length; i++) {
          const el: Element | null = sub[i] ? sub[i][0] : null;
          if (!el) continue;
          const cmdEl = el.querySelector(".program-list__command");
          const span = el.querySelector("span");
          const entry = sol[i] || null;
          if (entry && entry[1]) {
            setClassValue(el, "-condition", entry[0] || "any");
            if (cmdEl) setClassValue(cmdEl, "-command", entry[1]);
            if (span) (span as HTMLElement).style.display = "none";
          } else {
            setClassValue(el, "-condition", "");
            if (cmdEl) setClassValue(cmdEl, "-command", "");
            if (span) (span as HTMLElement).style.display = "";
          }
        }
      }
      if (typeof r.updatePuzzleUrl === "function") r.updatePuzzleUrl();
      return true;
    },

    reset: () => {
      const r = game();
      if (!r || typeof r.stepReset !== "function") return false;
      r.stepReset();
      return true;
    },

    step: () => {
      const btn = document.getElementById("program-step") as HTMLButtonElement | null;
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    },

    go: () => {
      const btn = document.getElementById("program-go") as HTMLButtonElement | null;
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    },

    setSpeed: (ms: number) => {
      const r = game();
      if (r) r.robotDelay = Math.max(10, Number(ms) || 250);
      const s = document.getElementById("program-speed") as HTMLInputElement | null;
      if (s) {
        const delay = r?.robotDelay ?? 250;
        const speed = r ? Math.round(Math.max(0, Math.min(10, 10 - Math.cbrt(delay - 20)))) : 5;
        s.value = String(speed);
      }
    },
  };
}

export {};

