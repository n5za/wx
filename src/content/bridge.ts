/**
 * Installs the "bridge" that re-exposes the game's `window.robozzle` state on
 * `window.__robosolver` so the isolated-world content script can read it.
 *
 * The bridge itself lives in `bridgeScript.ts` and is registered as a content
 * script with `world: "MAIN"` in the manifest (the primary mechanism). It must
 * not be injected as an inline `<script>` element: pages whose Content Security
 * Policy forbids `unsafe-inline` block that. This module only ensures the
 * bridge is present and provides a `chrome.runtime.getURL` fallback for cases
 * where the manifest entry did not run.
 */
export function injectBridge(): void {
  if (typeof window === "undefined") return;
  if (window.__robosolver) return;
  if (document.querySelector("script[data-robosolver-bridge]")) return;

  const script = document.createElement("script");
  script.dataset.robosolverBridge = "1";
  script.async = true;
  script.src = chrome.runtime.getURL("bridge.js");
  script.addEventListener("load", () => script.remove());
  script.addEventListener("error", () => script.remove());
  (document.head || document.documentElement).appendChild(script);
}
