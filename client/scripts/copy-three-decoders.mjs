import { cp, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const threeRoot = resolve(root, "node_modules/three/examples/jsm/libs");
const publicRoot = resolve(root, "public/three-decoders");

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function copyDir(source, destination) {
  if (!(await exists(source))) return false;
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  return true;
}

const draco = await copyDir(resolve(threeRoot, "draco/gltf"), resolve(publicRoot, "draco"));
const basis = await copyDir(resolve(threeRoot, "basis"), resolve(publicRoot, "basis"));

if (!draco || !basis) {
  console.warn("[Camera Studio] Decoder assets were not copied. Run npm install in client first.");
} else {
  console.log("[Camera Studio] Local Draco + Basis/KTX2 decoder assets ready.");
}
