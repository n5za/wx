import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: "es2020",
  logLevel: "info",
  loader: { ".ts": "ts" },
};

async function clean() {
  await rm("dist", { recursive: true, force: true });
}

async function buildAll() {
  await clean();
  await mkdir("dist/popup", { recursive: true });

  await build({
    ...common,
    entryPoints: ["src/content/content.ts"],
    outfile: "dist/content.js",
  });

  await build({
    ...common,
    entryPoints: ["src/content/bridgeScript.ts"],
    outfile: "dist/bridge.js",
  });

  await build({
    ...common,
    entryPoints: ["src/popup/popup.ts"],
    outfile: "dist/popup/popup.js",
  });

  await cp("manifest.json", "dist/manifest.json");
  await cp("src/popup/popup.html", "dist/popup/popup.html");
  await cp("src/popup/popup.css", "dist/popup/popup.css");
  console.log("Build complete -> dist/");
}

async function watchAll() {
  await clean();
  await mkdir("dist/popup", { recursive: true });

  const ctxContent = await context({
    ...common,
    entryPoints: ["src/content/content.ts"],
    outfile: "dist/content.js",
  });
  const ctxBridge = await context({
    ...common,
    entryPoints: ["src/content/bridgeScript.ts"],
    outfile: "dist/bridge.js",
  });
  const ctxPopup = await context({
    ...common,
    entryPoints: ["src/popup/popup.ts"],
    outfile: "dist/popup/popup.js",
  });

  await Promise.all([ctxContent.watch(), ctxBridge.watch(), ctxPopup.watch()]);
  await cp("manifest.json", "dist/manifest.json");
  await cp("src/popup/popup.html", "dist/popup/popup.html");
  await cp("src/popup/popup.css", "dist/popup/popup.css");
  console.log("Watching for changes -> dist/");
}

if (watch) {
  watchAll().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  buildAll().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
