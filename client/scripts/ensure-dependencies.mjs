import { existsSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = join(here, "..");
const packageJsonPath = join(clientDir, "package.json");
const nodeModulesDir = join(clientDir, "node_modules");
const viteCacheDir = join(nodeModulesDir, ".vite");

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const required = Object.keys(pkg.dependencies || {});
const missing = required.filter((name) => !existsSync(join(nodeModulesDir, name, "package.json")));

if (!missing.length) {
  console.log("[deps] Dependencies ready.");
  process.exit(0);
}

console.log(`[deps] Missing: ${missing.join(", ")}`);
console.log("[deps] Repairing client dependencies...");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["install", "--no-audit", "--no-fund"],
  {
    cwd: clientDir,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error || result.status !== 0) {
  console.error("\n[deps] Automatic install failed.");
  console.error("Run this manually from the project folder:");
  console.error("  npm install --prefix client");
  process.exit(result.status || 1);
}

const stillMissing = required.filter((name) => !existsSync(join(nodeModulesDir, name, "package.json")));
if (stillMissing.length) {
  console.error(`[deps] Still missing after install: ${stillMissing.join(", ")}`);
  process.exit(1);
}

// Vite may cache failed import-analysis results from the previous dependency set.
if (existsSync(viteCacheDir)) {
  rmSync(viteCacheDir, { recursive: true, force: true });
  console.log("[deps] Cleared stale Vite dependency cache.");
}

console.log("[deps] Repair complete.");
