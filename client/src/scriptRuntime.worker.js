const blocked = () => {
  throw new Error("Network and host-global access are disabled inside the MultiView script worker.");
};

try { self.fetch = blocked; } catch {}
try { self.XMLHttpRequest = undefined; } catch {}
try { self.WebSocket = undefined; } catch {}
try { self.EventSource = undefined; } catch {}
try { self.importScripts = blocked; } catch {}

function clone(value) {
  if (value == null) return value;
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function sanitizeIds(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5000);
}

self.onmessage = async (event) => {
  const { id, source, snapshot, permissions = ["*"] } = event.data || {};
  const permissionSet = new Set(Array.isArray(permissions) ? permissions.map(String) : ["*"]);
  const requirePermission = (name) => {
    if (permissionSet.has("*") || permissionSet.has(name)) return true;
    throw new Error(`Extension permission denied: ${name}`);
  };
  const commands = [];
  const logs = [];
  let stopped = false;

  const push = (type, payload = {}) => {
    if (stopped) throw new Error("Script execution was stopped.");
    commands.push({ type, payload: clone(payload) });
  };

  const formatLogValue = (arg) => {
    if (typeof arg === "string") return arg;
    try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
  };
  const log = (...args) => {
    const text = args.map(formatLogValue).join(" ");
    logs.push({ level: "log", text: text.slice(0, 12000) });
  };

  const studio = Object.freeze({
    version: "8.18",
    snapshot: () => { requirePermission("*"); return clone(snapshot || {}); },
    log,
    warn: (...args) => logs.push({ level: "warn", text: args.map(formatLogValue).join(" ").slice(0, 12000) }),
    settings: Object.freeze({
      get: (key, fallback = null) => {
        const settings = snapshot?.extension?.settings || {};
        return Object.prototype.hasOwnProperty.call(settings, key) ? clone(settings[key]) : fallback;
      },
      all: () => clone(snapshot?.extension?.settings || {}),
    }),
    input: Object.freeze({
      name: () => { requirePermission("file:read"); return String(snapshot?.input?.name || ""); },
      type: () => { requirePermission("file:read"); return String(snapshot?.input?.type || ""); },
      text: () => { requirePermission("file:read"); return String(snapshot?.input?.text || ""); },
      json: () => { requirePermission("file:read"); return JSON.parse(String(snapshot?.input?.text || "{}")); },
    }),
    camera: Object.freeze({
      get: () => { requirePermission("camera:read"); return clone(snapshot?.camera || {}); },
      set: (patch = {}) => { requirePermission("camera:write"); push("camera.set", patch); },
      reset: () => { requirePermission("camera:write"); push("camera.reset"); },
    }),
    scene: Object.freeze({
      graph: () => { requirePermission("scene:read"); return clone(snapshot?.scene?.graph || null); },
      selection: () => { requirePermission("scene:read"); return clone(snapshot?.scene?.selectedIds || []); },
      select: (ids, additive = false) => { requirePermission("scene:write"); push("scene.select", { ids: sanitizeIds(ids), additive: Boolean(additive) }); },
      frame: (ids = null) => { requirePermission("scene:read"); push("scene.frame", { ids: sanitizeIds(ids ?? snapshot?.scene?.selectedIds) }); },
      hide: (ids) => { requirePermission("scene:write"); push("scene.visibility", { ids: sanitizeIds(ids), visible: false }); },
      show: (ids) => { requirePermission("scene:write"); push("scene.visibility", { ids: sanitizeIds(ids), visible: true }); },
      showAll: () => { requirePermission("scene:write"); push("scene.showAll"); },
      isolate: (ids = null) => { requirePermission("scene:write"); push("scene.isolate", { ids: sanitizeIds(ids ?? snapshot?.scene?.selectedIds) }); },
      duplicate: (ids = null) => { requirePermission("scene:write"); push("scene.duplicate", { ids: sanitizeIds(ids ?? snapshot?.scene?.selectedIds) }); },
      delete: (ids = null) => { requirePermission("scene:write"); push("scene.delete", { ids: sanitizeIds(ids ?? snapshot?.scene?.selectedIds) }); },
      rename: (id, name) => { requirePermission("scene:write"); push("scene.rename", { id: String(id || ""), name: String(name || "").slice(0, 120) }); },
      transform: (id, patch) => { requirePermission("scene:write"); push("scene.transform", { id: String(id || ""), patch }); },
      parent: (childIds, parentId = null) => { requirePermission("scene:write"); push("scene.parent", { childIds: sanitizeIds(childIds), parentId: parentId == null ? null : String(parentId) }); },
      fractureSelection: (options = {}) => { requirePermission("scene:write"); push("scene.fracture", { ids: sanitizeIds(snapshot?.scene?.selectedIds), options }); },
      analyze3DPrint: (ids = null) => { requirePermission("scene:read"); push("scene.analyze3dprint", { ids: sanitizeIds(ids ?? snapshot?.scene?.selectedIds) }); },
    }),
    generate: Object.freeze({
      terrain: (options = {}) => { requirePermission("scene:write"); push("generate.terrain", options); },
      tree: (options = {}) => { requirePermission("scene:write"); push("generate.tree", options); },
      ivy: (options = {}) => { requirePermission("scene:write"); push("generate.ivy", options); },
      cloud: (options = {}) => { requirePermission("scene:write"); push("generate.cloud", options); },
      metaRig: (options = {}) => { requirePermission("scene:write"); push("generate.metaRig", options); },
      primitive: (type = "cube", options = {}) => { requirePermission("scene:write"); push("generate.primitive", { type, ...options }); },
    }),
    material: Object.freeze({
      update: (materialId, patch = {}) => { requirePermission("material:write"); push("material.update", { materialId: String(materialId || ""), patch }); },
    }),
    lighting: Object.freeze({
      get: () => { requirePermission("lighting:read"); return clone(snapshot?.lighting || {}); },
      set: (patch = {}) => { requirePermission("lighting:write"); push("lighting.set", patch); },
    }),
    export: Object.freeze({
      camera: () => { requirePermission("export:write"); push("export.camera"); },
      scene: () => { requirePermission("export:write"); push("export.scene"); },
      transform: () => { requirePermission("export:write"); push("export.transform"); },
      prompt: () => { requirePermission("export:write"); push("export.prompt"); },
      unrealCamera: () => { requirePermission("export:write"); push("export.unrealCamera"); },
    }),
    project: Object.freeze({
      save: () => { requirePermission("project:write"); push("project.save"); },
    }),
  });

  const safeConsole = Object.freeze({ log, info: log, warn: studio.warn, error: studio.warn });

  try {
    const sourceText = String(source || "");
    if (/\bimport\s*\(/.test(sourceText)) throw new Error("Dynamic import() is disabled inside the MultiView script worker.");
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction(
      "studio",
      "console",
      `"use strict";\nconst fetch=undefined, XMLHttpRequest=undefined, WebSocket=undefined, EventSource=undefined, Worker=undefined, SharedWorker=undefined, importScripts=undefined, document=undefined, window=undefined, localStorage=undefined, sessionStorage=undefined, self=undefined, globalThis=undefined, Function=undefined;\n${sourceText}\n`,
    );
    await runner(studio, safeConsole);
    self.postMessage({ type: "complete", id, commands, logs });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      commands,
      logs,
      error: { message: error?.message || String(error), stack: String(error?.stack || "").slice(0, 12000) },
    });
  } finally {
    stopped = true;
  }
};
