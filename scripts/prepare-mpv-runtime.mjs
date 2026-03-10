import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const runtimeDir = join(repoRoot, "src-tauri", "resources", "mpv", "windows");

const strictMode =
  process.argv.includes("--strict") ||
  /^(1|true|yes)$/i.test(process.env.REQUIRE_MPV_RUNTIME ?? "");
const sourceDirInput = (process.env.MPV_DLL_DIR ?? "").trim();

mkdirSync(runtimeDir, { recursive: true });

function fail(message) {
  console.error(`[prepare-mpv-runtime] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[prepare-mpv-runtime] ${message}`);
}

if (sourceDirInput.length > 0) {
  const sourceDir = resolve(sourceDirInput);
  if (!existsSync(sourceDir)) {
    fail(`MPV_DLL_DIR does not exist: ${sourceDir}`);
  }
  if (!statSync(sourceDir).isDirectory()) {
    fail(`MPV_DLL_DIR is not a directory: ${sourceDir}`);
  }

  for (const entry of readdirSync(runtimeDir, { withFileTypes: true })) {
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".dll") {
      rmSync(join(runtimeDir, entry.name), { force: true });
    }
  }

  const copied = [];
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".dll") {
      const source = join(sourceDir, entry.name);
      const destination = join(runtimeDir, entry.name);
      copyFileSync(source, destination);
      copied.push(entry.name);
    }
  }

  if (copied.length === 0) {
    const message = `No DLL files were found in MPV_DLL_DIR: ${sourceDir}`;
    if (strictMode) {
      fail(message);
    }
    info(`${message}. Continuing without bundled runtime.`);
  } else {
    info(`Copied ${copied.length} DLL file(s) from ${sourceDir} to ${runtimeDir}.`);
  }
}

const bundledDlls = readdirSync(runtimeDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".dll")
  .map((entry) => entry.name.toLowerCase());

const hasCoreMpvDll = bundledDlls.some((name) =>
  ["mpv-2.dll", "libmpv-2.dll", "mpv.dll"].includes(name),
);

if (!hasCoreMpvDll) {
  const message =
    "No core libmpv DLL detected in src-tauri/resources/mpv/windows. " +
    "Set MPV_DLL_DIR to a folder containing mpv-2.dll (and related FFmpeg DLLs) before release builds.";

  if (strictMode) {
    fail(message);
  }

  info(`${message} Continuing because strict mode is disabled.`);
} else {
  info(`Detected bundled runtime DLLs: ${bundledDlls.join(", ")}.`);
}

