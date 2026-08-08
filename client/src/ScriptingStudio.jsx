import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  FileCode2,
  Gauge,
  Package,
  Play,
  Puzzle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { BUILTIN_EXTENSIONS, DEFAULT_SCRIPT, EXTENSION_TEMPLATE, SCRIPT_TEMPLATES } from "./extensions/builtinExtensions.js";
import { EXTENSION_LIBRARY, compareVersions } from "./extensions/extensionLibrary.js";

const ENABLED_KEY = "multiview-v8.18-enabled-extensions";
const CUSTOM_KEY = "multiview-v8.18-custom-extensions";
const SETTINGS_KEY = "multiview-v8.18-extension-settings";
const SCRIPT_KEY = "multiview-v8.18-last-script";
const PROFILER_KEY = "multiview-v8.18-extension-profiler";
const LEGACY_ENABLED_KEY = "multiview-v8.10-enabled-extensions";
const LEGACY_CUSTOM_KEY = "multiview-v8.10-custom-extensions";

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeContributionList(value, limit = 50) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map((item, index) => ({
    id: String(item?.id || `item-${index}`).slice(0, 100),
    label: String(item?.label || item?.title || item?.id || `Item ${index + 1}`).slice(0, 140),
    title: String(item?.title || item?.label || "").slice(0, 140),
    description: String(item?.description || "").slice(0, 400),
    actionId: String(item?.actionId || "").slice(0, 100),
    script: typeof item?.script === "string" ? item.script.slice(0, 100000) : "",
    combo: String(item?.combo || "").slice(0, 60),
    icon: String(item?.icon || "").slice(0, 60),
    phase: ["before", "after"].includes(item?.phase) ? item.phase : "",
    extensions: Array.isArray(item?.extensions) ? item.extensions.map(String).slice(0, 30) : [],
    actionIds: Array.isArray(item?.actionIds) ? item.actionIds.map(String).slice(0, 30) : [],
  }));
}

function normalizeSettingsSchema(value) {
  return (Array.isArray(value) ? value : []).slice(0, 50).map((item, index) => ({
    id: String(item?.id || `setting-${index}`).slice(0, 80),
    label: String(item?.label || item?.id || `Setting ${index + 1}`).slice(0, 120),
    type: ["boolean", "number", "select", "text"].includes(item?.type) ? item.type : "text",
    default: item?.default,
    min: Number.isFinite(Number(item?.min)) ? Number(item.min) : undefined,
    max: Number.isFinite(Number(item?.max)) ? Number(item.max) : undefined,
    step: Number.isFinite(Number(item?.step)) ? Number(item.step) : undefined,
    options: Array.isArray(item?.options) ? item.options.map(String).slice(0, 50) : [],
  }));
}

function normalizeDependencies(value) {
  return (Array.isArray(value) ? value : []).slice(0, 30).map((item) => {
    if (typeof item === "string") return { id: item, version: "0.0.0" };
    return { id: String(item?.id || "").slice(0, 120), version: String(item?.version || "0.0.0").slice(0, 32) };
  }).filter((item) => item.id);
}

function validateExtensionPackage(value, { custom = true, library = false } = {}) {
  if (!value || value.format !== "multiview-extension" || ![1, 2].includes(Number(value.formatVersion))) throw new Error("Not a valid MultiView extension package.");
  const manifest = value.manifest || {};
  if (!String(manifest.id || "").trim() || !String(manifest.name || "").trim()) throw new Error("Extension manifest requires id and name.");
  const actions = Array.isArray(value.actions) ? value.actions : [];
  const contributions = value.contributions || {};
  if (!actions.length && !Object.values(contributions).some((item) => Array.isArray(item) && item.length)) throw new Error("Extension package has no actions or contributions.");
  actions.forEach((action) => {
    if (!action?.id || !action?.label || typeof action?.script !== "string") throw new Error("Every extension action requires id, label, and script.");
  });
  return {
    id: String(manifest.id).slice(0, 120),
    name: String(manifest.name).slice(0, 120),
    version: String(manifest.version || "1.0.0").slice(0, 32),
    author: String(manifest.author || "Unknown").slice(0, 80),
    category: String(manifest.category || "Custom").slice(0, 64),
    description: String(manifest.description || "Custom MultiView extension").slice(0, 500),
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions.map(String).slice(0, 30) : [],
    dependencies: normalizeDependencies(manifest.dependencies),
    settingsSchema: normalizeSettingsSchema(manifest.settings),
    actions: actions.slice(0, 60).map((action) => ({
      id: String(action.id).slice(0, 80),
      label: String(action.label).slice(0, 120),
      description: String(action.description || "").slice(0, 400),
      script: String(action.script).slice(0, 100000),
    })),
    contributions: {
      toolbar: normalizeContributionList(contributions.toolbar),
      inspectorPanels: normalizeContributionList(contributions.inspectorPanels),
      outlinerMenu: normalizeContributionList(contributions.outlinerMenu),
      importers: normalizeContributionList(contributions.importers),
      exporters: normalizeContributionList(contributions.exporters),
      generators: normalizeContributionList(contributions.generators),
      renderHooks: normalizeContributionList(contributions.renderHooks),
      shortcuts: normalizeContributionList(contributions.shortcuts),
    },
    formatVersion: Number(value.formatVersion),
    custom,
    library,
    enabledByDefault: false,
  };
}

function normalizeBuiltinExtension(extension) {
  return {
    ...extension,
    dependencies: normalizeDependencies(extension.dependencies),
    settingsSchema: normalizeSettingsSchema(extension.settingsSchema || extension.settings),
    contributions: {
      toolbar: normalizeContributionList(extension.contributions?.toolbar),
      inspectorPanels: normalizeContributionList(extension.contributions?.inspectorPanels),
      outlinerMenu: normalizeContributionList(extension.contributions?.outlinerMenu),
      importers: normalizeContributionList(extension.contributions?.importers),
      exporters: normalizeContributionList(extension.contributions?.exporters),
      generators: normalizeContributionList(extension.contributions?.generators),
      renderHooks: normalizeContributionList(extension.contributions?.renderHooks),
      shortcuts: normalizeContributionList(extension.contributions?.shortcuts),
    },
    formatVersion: 2,
    custom: false,
    library: false,
  };
}

function extensionToPackage(extension) {
  return {
    format: "multiview-extension",
    formatVersion: 2,
    manifest: {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      author: extension.author,
      category: extension.category,
      description: extension.description,
      permissions: extension.permissions || [],
      dependencies: extension.dependencies || [],
      settings: extension.settingsSchema || [],
    },
    actions: extension.actions || [],
    contributions: extension.contributions || {},
  };
}

function triggerTextDownload(filename, content, type = "application/json") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function comboMatches(event, combo = "") {
  if (!combo) return false;
  const parts = combo.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  const key = parts.pop();
  const alt = parts.includes("alt");
  const shift = parts.includes("shift");
  const ctrl = parts.includes("ctrl") || parts.includes("control");
  const meta = parts.includes("meta") || parts.includes("cmd") || parts.includes("command");
  return Boolean(event.altKey) === alt && Boolean(event.shiftKey) === shift && Boolean(event.ctrlKey) === ctrl && Boolean(event.metaKey) === meta && String(event.key || "").toLowerCase() === key;
}

function contributionCount(extension) {
  return Object.values(extension?.contributions || {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
}

export default function ScriptingStudio({ snapshot, onExecuteCommands }) {
  const extensionInputRef = useRef(null);
  const extensionImporterInputRef = useRef(null);
  const pendingImporterRef = useRef(null);
  const workerRef = useRef(null);
  const runIdRef = useRef(0);
  const timeoutRef = useRef(null);
  const [script, setScript] = useState(() => localStorage.getItem(SCRIPT_KEY) || DEFAULT_SCRIPT);
  const [running, setRunning] = useState(false);
  const [consoleLines, setConsoleLines] = useState(() => [
    { id: "welcome", level: "info", text: "MultiView Extension Platform V2 ready. Ctrl+Enter runs the current script." },
  ]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [libraryTab, setLibraryTab] = useState("installed");
  const [selectedExtensionId, setSelectedExtensionId] = useState(BUILTIN_EXTENSIONS[0]?.id || "");
  const [customExtensions, setCustomExtensions] = useState(() => {
    const next = safeParse(localStorage.getItem(CUSTOM_KEY) || "null", null);
    const legacy = safeParse(localStorage.getItem(LEGACY_CUSTOM_KEY) || "[]", []);
    const parsed = Array.isArray(next) ? next : legacy;
    return parsed.map((item) => {
      try {
        if (item?.format === "multiview-extension") return validateExtensionPackage(item);
        return { ...normalizeBuiltinExtension(item), custom: true };
      } catch { return null; }
    }).filter(Boolean);
  });
  const [enabledIds, setEnabledIds] = useState(() => {
    const next = safeParse(localStorage.getItem(ENABLED_KEY) || "null", null);
    const legacy = safeParse(localStorage.getItem(LEGACY_ENABLED_KEY) || "null", null);
    if (Array.isArray(next)) return new Set(next);
    if (Array.isArray(legacy)) return new Set(legacy);
    return new Set(BUILTIN_EXTENSIONS.filter((item) => item.enabledByDefault).map((item) => item.id));
  });
  const [extensionSettings, setExtensionSettings] = useState(() => safeParse(localStorage.getItem(SETTINGS_KEY) || "{}", {}));
  const [profiler, setProfiler] = useState(() => safeParse(localStorage.getItem(PROFILER_KEY) || "{}", {}));
  const [copied, setCopied] = useState(false);

  const builtinNormalized = useMemo(() => BUILTIN_EXTENSIONS.map(normalizeBuiltinExtension), []);
  const installedExtensions = useMemo(() => [...builtinNormalized, ...customExtensions], [builtinNormalized, customExtensions]);
  const installedIdSet = useMemo(() => new Set(installedExtensions.map((item) => item.id)), [installedExtensions]);
  const libraryPackages = useMemo(() => EXTENSION_LIBRARY.map((item) => validateExtensionPackage(item, { custom: true, library: true })), []);
  const availableExtensions = useMemo(() => libraryPackages.filter((item) => !installedIdSet.has(item.id)), [libraryPackages, installedIdSet]);
  const extensions = libraryTab === "available" ? availableExtensions : installedExtensions;
  const categories = useMemo(() => ["All", ...new Set(extensions.map((item) => item.category).filter(Boolean))], [extensions]);
  const selectedExtension = [...installedExtensions, ...availableExtensions].find((item) => item.id === selectedExtensionId) || extensions[0] || null;
  const filteredExtensions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return extensions.filter((item) => {
      const categoryOk = category === "All" || item.category === category;
      const queryOk = !query || [item.name, item.category, item.author, item.description].join(" ").toLowerCase().includes(query);
      return categoryOk && queryOk;
    });
  }, [extensions, search, category]);
  const lineCount = Math.max(1, script.split("\n").length);

  const libraryById = useMemo(() => new Map(libraryPackages.map((item) => [item.id, item])), [libraryPackages]);
  const enabledExtensions = useMemo(() => installedExtensions.filter((item) => enabledIds.has(item.id)), [installedExtensions, enabledIds]);
  const toolbarContributions = useMemo(() => enabledExtensions.flatMap((extension) => (extension.contributions?.toolbar || []).map((item) => ({ ...item, extension }))).slice(0, 12), [enabledExtensions]);
  const hostContributions = useMemo(() => ({
    inspectorPanels: enabledExtensions.flatMap((extension) => (extension.contributions?.inspectorPanels || []).map((item) => ({ ...item, extension }))),
    outlinerMenu: enabledExtensions.flatMap((extension) => (extension.contributions?.outlinerMenu || []).map((item) => ({ ...item, extension }))),
    importers: enabledExtensions.flatMap((extension) => (extension.contributions?.importers || []).map((item) => ({ ...item, extension }))),
    exporters: enabledExtensions.flatMap((extension) => (extension.contributions?.exporters || []).map((item) => ({ ...item, extension }))),
    generators: enabledExtensions.flatMap((extension) => (extension.contributions?.generators || []).map((item) => ({ ...item, extension }))),
    renderHooks: enabledExtensions.flatMap((extension) => (extension.contributions?.renderHooks || []).map((item) => ({ ...item, extension }))),
    shortcuts: enabledExtensions.flatMap((extension) => (extension.contributions?.shortcuts || []).map((item) => ({ ...item, extension }))),
  }), [enabledExtensions]);

  useEffect(() => { localStorage.setItem(SCRIPT_KEY, script); }, [script]);
  useEffect(() => { localStorage.setItem(ENABLED_KEY, JSON.stringify([...enabledIds])); window.dispatchEvent(new CustomEvent("multiview:extensions-changed")); }, [enabledIds]);
  useEffect(() => { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customExtensions.map(extensionToPackage))); window.dispatchEvent(new CustomEvent("multiview:extensions-changed")); }, [customExtensions]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(extensionSettings)); }, [extensionSettings]);
  useEffect(() => { localStorage.setItem(PROFILER_KEY, JSON.stringify(profiler)); }, [profiler]);
  useEffect(() => () => { workerRef.current?.terminate?.(); if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);


  useEffect(() => {
    if (selectedExtensionId && [...installedExtensions, ...availableExtensions].some((item) => item.id === selectedExtensionId)) return;
    setSelectedExtensionId(extensions[0]?.id || "");
  }, [libraryTab, extensions, selectedExtensionId, installedExtensions, availableExtensions]);

  useEffect(() => { setCategory("All"); }, [libraryTab]);

  function appendConsole(level, text) {
    const line = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, level, text: String(text || "") };
    setConsoleLines((current) => [...current, line].slice(-500));
  }

  function updateProfiler(extensionId, elapsedMs, failed = false) {
    if (!extensionId) return;
    setProfiler((current) => {
      const previous = current[extensionId] || { runs: 0, totalMs: 0, maxMs: 0, lastMs: 0, errors: 0 };
      return {
        ...current,
        [extensionId]: {
          runs: previous.runs + 1,
          totalMs: previous.totalMs + elapsedMs,
          maxMs: Math.max(previous.maxMs, elapsedMs),
          lastMs: elapsedMs,
          errors: previous.errors + (failed ? 1 : 0),
        },
      };
    });
  }

  async function runSource(source, label = "Script", permissions = ["*"], extensionId = "", extraSnapshot = null) {
    if (running || !String(source || "").trim()) return;
    const runId = ++runIdRef.current;
    const startedAt = performance.now();
    const worker = new Worker(new URL("./scriptRuntime.worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setRunning(true);
    appendConsole("info", `▶ ${label}`);

    let finished = false;
    const cleanup = (failed = false) => {
      if (finished) return;
      finished = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setRunning(false);
      updateProfiler(extensionId, Math.max(0, performance.now() - startedAt), failed);
    };

    timeoutRef.current = window.setTimeout(() => {
      appendConsole("error", `${label} exceeded the 12 second execution limit and was stopped.`);
      cleanup(true);
    }, 12000);

    worker.onerror = (event) => {
      appendConsole("error", event.message || "Script worker crashed.");
      cleanup(true);
    };

    worker.onmessage = async (event) => {
      const data = event.data || {};
      if (data.id !== runId) return;
      (data.logs || []).forEach((item) => appendConsole(item.level || "log", item.text));
      if (data.type === "error") appendConsole("error", data.error?.message || "Script failed.");
      let failed = data.type === "error";
      try {
        if (data.commands?.length) {
          const results = await onExecuteCommands?.(data.commands);
          (results || []).forEach((item) => {
            if (!item) return;
            appendConsole(item.level || "info", item.text || JSON.stringify(item));
          });
        }
        appendConsole(failed ? "warn" : "success", failed ? "Script stopped with an error." : `✓ ${label} finished`);
      } catch (error) {
        failed = true;
        appendConsole("error", `Host command failed: ${error?.message || error}`);
      } finally {
        cleanup(failed);
      }
    };

    worker.postMessage({ id: runId, source: String(source || ""), snapshot: { ...(snapshot || {}), ...(extraSnapshot || {}), extension: { id: extensionId || null, settings: extensionId ? (extensionSettings[extensionId] || {}) : {} } }, permissions });
  }

  function stopRun() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    workerRef.current?.terminate?.();
    workerRef.current = null;
    setRunning(false);
    appendConsole("warn", "■ Script execution stopped by user.");
  }

  function toggleExtension(id) {
    setEnabledIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function dependencyStatus(extension) {
    const dependencies = extension?.dependencies || [];
    return dependencies.map((dependency) => {
      const installed = installedExtensions.find((item) => item.id === dependency.id);
      return {
        ...dependency,
        installedVersion: installed?.version || "",
        ok: Boolean(installed && compareVersions(installed.version, dependency.version) >= 0),
      };
    });
  }

  function installNormalizedExtension(extension) {
    const dependencies = dependencyStatus(extension);
    const missing = dependencies.filter((item) => !item.ok);
    if (missing.length) {
      appendConsole("error", `Cannot install ${extension.name}. Missing dependencies: ${missing.map((item) => `${item.id} >= ${item.version}`).join(", ")}`);
      return;
    }
    setCustomExtensions((current) => [{ ...extension, custom: true }, ...current.filter((item) => item.id !== extension.id)].slice(0, 80));
    setSelectedExtensionId(extension.id);
    setEnabledIds((current) => new Set([...current, extension.id]));
    setLibraryTab("installed");
    appendConsole("success", `Installed extension: ${extension.name} ${extension.version}`);
  }

  async function installExtension(file) {
    if (!file) return;
    try {
      const parsed = validateExtensionPackage(JSON.parse(await file.text()));
      if (builtinNormalized.some((item) => item.id === parsed.id)) throw new Error("That ID is reserved by a built-in extension.");
      installNormalizedExtension(parsed);
    } catch (error) {
      appendConsole("error", `Extension install failed: ${error?.message || error}`);
    } finally {
      if (extensionInputRef.current) extensionInputRef.current.value = "";
    }
  }

  function uninstallExtension(extension) {
    if (!extension?.custom) return;
    setCustomExtensions((current) => current.filter((item) => item.id !== extension.id));
    setEnabledIds((current) => { const next = new Set(current); next.delete(extension.id); return next; });
    setSelectedExtensionId(builtinNormalized[0]?.id || "");
    appendConsole("info", `Removed extension: ${extension.name}`);
  }

  function updateExtension(extension) {
    const candidate = libraryById.get(extension?.id);
    if (!candidate || compareVersions(candidate.version, extension.version) <= 0) return;
    installNormalizedExtension(candidate);
    appendConsole("success", `Updated ${extension.name} to ${candidate.version}`);
  }

  function exportExtension(extension) {
    if (!extension) return;
    triggerTextDownload(`${extension.id.replace(/[^a-z0-9._-]+/gi, "-")}-${extension.version}.mvext`, JSON.stringify(extensionToPackage(extension), null, 2));
  }

  function exportExtensionTemplate() {
    triggerTextDownload("multiview-extension-v2-template.mvext", JSON.stringify(EXTENSION_TEMPLATE, null, 2));
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      appendConsole("error", "Clipboard permission was denied.");
    }
  }

  function actionSource(extension, contribution) {
    const action = extension?.actions?.find((item) => item.id === contribution?.actionId);
    return contribution?.script || action?.script || "";
  }

  function runContribution(contribution) {
    const source = actionSource(contribution.extension, contribution);
    if (!source) return;
    runSource(source, `${contribution.extension.name} › ${contribution.label}`, contribution.extension.permissions || [], contribution.extension.id);
  }

  function openExtensionImporter(contribution) {
    pendingImporterRef.current = contribution;
    if (!extensionImporterInputRef.current) return;
    extensionImporterInputRef.current.value = "";
    extensionImporterInputRef.current.accept = (contribution.extensions || []).join(",") || ".json,.txt";
    extensionImporterInputRef.current.click();
  }

  async function handleExtensionImportFile(file) {
    const contribution = pendingImporterRef.current;
    pendingImporterRef.current = null;
    if (!file || !contribution) return;
    if (file.size > 5 * 1024 * 1024) {
      appendConsole("error", "Extension text importers are limited to 5 MB files.");
      return;
    }
    try {
      const text = await file.text();
      const source = actionSource(contribution.extension, contribution);
      if (!source) throw new Error("Importer has no script/action.");
      await runSource(source, `${contribution.extension.name} › ${contribution.label}`, contribution.extension.permissions || [], contribution.extension.id, { input: { name: file.name, type: file.type, size: file.size, text } });
    } catch (error) {
      appendConsole("error", `Importer failed: ${error?.message || error}`);
    }
  }

  function settingValue(extension, setting) {
    const own = extensionSettings?.[extension.id]?.[setting.id];
    return own ?? setting.default ?? (setting.type === "boolean" ? false : "");
  }

  function updateSetting(extension, setting, value) {
    setExtensionSettings((current) => ({ ...current, [extension.id]: { ...(current[extension.id] || {}), [setting.id]: value } }));
  }

  const selectedProfiler = selectedExtension ? profiler[selectedExtension.id] : null;
  const selectedUpdate = selectedExtension ? libraryById.get(selectedExtension.id) : null;
  const hasUpdate = Boolean(selectedExtension && selectedUpdate && compareVersions(selectedUpdate.version, selectedExtension.version) > 0);
  const selectedDependencies = selectedExtension ? dependencyStatus(selectedExtension) : [];

  return (
    <section className="scriptingWorkspace extensionPlatformV2" aria-label="MultiView Scripting and Extensions workspace">
      <aside className="scriptingExtensionsPane extensionLibraryPane">
        <div className="scriptEditorHeader">
          <span><Puzzle size={13} /> Extension Library</span>
          <div>
            <button type="button" title="Install .mvext" onClick={() => extensionInputRef.current?.click()}><Upload size={12} /></button>
            <button type="button" title="Download V2 extension template" onClick={exportExtensionTemplate}><Download size={12} /></button>
          </div>
        </div>
        <input ref={extensionInputRef} hidden type="file" accept=".mvext,.json,application/json" onChange={(event) => installExtension(event.target.files?.[0])} />
        <input ref={extensionImporterInputRef} hidden type="file" onChange={(event) => handleExtensionImportFile(event.target.files?.[0])} />
        <div className="extensionLibraryTabs"><button type="button" className={libraryTab === "installed" ? "active" : ""} onClick={() => setLibraryTab("installed")}>Installed <b>{installedExtensions.length}</b></button><button type="button" className={libraryTab === "available" ? "active" : ""} onClick={() => setLibraryTab("available")}>Available <b>{availableExtensions.length}</b></button></div>
        <label className="extensionSearch"><Search size={12} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search extensions" /></label>
        <div className="extensionCategoryBar"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="extensionList">
          {filteredExtensions.map((extension) => {
            const enabled = enabledIds.has(extension.id);
            const update = libraryById.get(extension.id);
            const updateAvailable = update && compareVersions(update.version, extension.version) > 0;
            return (
              <button type="button" key={extension.id} className={`extensionListRow ${selectedExtensionId === extension.id ? "selected" : ""}`} onClick={() => setSelectedExtensionId(extension.id)}>
                <span className={`extensionStateDot ${enabled ? "enabled" : ""}`} />
                <span className="extensionListText"><b>{extension.name}</b><small>{extension.category} · v{extension.version}</small></span>
                {updateAvailable && <em>UPDATE</em>}
                {extension.experimental && <em>EXP</em>}
              </button>
            );
          })}
          {!filteredExtensions.length && <div className="extensionEmpty">No extensions match this filter.</div>}
        </div>

        {selectedExtension && (
          <div className="extensionDetails extensionV2Details">
            <div className="extensionDetailsTitle"><div><strong>{selectedExtension.name}</strong><small>{selectedExtension.author} · v{selectedExtension.version}</small></div>{libraryTab === "installed" ? <label className="extensionToggle"><input type="checkbox" checked={enabledIds.has(selectedExtension.id)} onChange={() => toggleExtension(selectedExtension.id)} /><span /></label> : <button type="button" className="extensionInstallButton" onClick={() => installNormalizedExtension(selectedExtension)}>Install</button>}</div>
            <p>{selectedExtension.description}</p>
            <div className="extensionMetaGrid"><span>Category <b>{selectedExtension.category}</b></span><span>API <b>V{selectedExtension.formatVersion || 2}</b></span><span>Contributions <b>{contributionCount(selectedExtension)}</b></span></div>
            <div className="extensionPermissionList"><ShieldCheck size={12} /><span>{selectedExtension.permissions?.length ? selectedExtension.permissions.join(" · ") : "No special permissions"}</span></div>
            {selectedDependencies.length > 0 && <div className="extensionDependencies"><strong>Dependencies</strong>{selectedDependencies.map((item) => <span key={item.id} className={item.ok ? "ok" : "missing"}>{item.ok ? "✓" : "!"} {item.id} ≥ {item.version}{item.installedVersion ? ` · installed ${item.installedVersion}` : ""}</span>)}</div>}
            {hasUpdate && libraryTab === "installed" && <button type="button" className="extensionUpdateButton" onClick={() => updateExtension(selectedExtension)}><RefreshCw size={11} /> Update to {selectedUpdate.version}</button>}
            {selectedExtension.settingsSchema?.length > 0 && <details className="extensionSettingsPanel" open><summary><Settings2 size={11} /> Settings <ChevronDown size={11} /></summary><div>{selectedExtension.settingsSchema.map((setting) => <label key={setting.id}><span>{setting.label}</span>{setting.type === "boolean" ? <input type="checkbox" checked={Boolean(settingValue(selectedExtension, setting))} onChange={(event) => updateSetting(selectedExtension, setting, event.target.checked)} /> : setting.type === "select" ? <select value={settingValue(selectedExtension, setting)} onChange={(event) => updateSetting(selectedExtension, setting, event.target.value)}>{setting.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={setting.type === "number" ? "number" : "text"} min={setting.min} max={setting.max} step={setting.step} value={settingValue(selectedExtension, setting)} onChange={(event) => updateSetting(selectedExtension, setting, setting.type === "number" ? Number(event.target.value) : event.target.value)} />}</label>)}</div></details>}
            <div className="extensionActions">
              {(selectedExtension.actions || []).map((action) => (
                <button type="button" key={action.id} disabled={libraryTab !== "installed" || !enabledIds.has(selectedExtension.id) || running} onClick={() => runSource(action.script, `${selectedExtension.name} › ${action.label}`, selectedExtension.permissions || [], selectedExtension.id)}>
                  <Play size={11} /><span><b>{action.label}</b><small>{action.description}</small></span>
                </button>
              ))}
            </div>
            {libraryTab === "installed" && <div className="extensionManageRow"><button type="button" onClick={() => exportExtension(selectedExtension)}><Download size={11} /> Export .mvext</button>{selectedExtension.custom && <button type="button" className="uninstallExtensionButton" onClick={() => uninstallExtension(selectedExtension)}><Trash2 size={11} /> Uninstall</button>}</div>}
          </div>
        )}
      </aside>

      <main className="scriptingEditorPane">
        {toolbarContributions.length > 0 && <div className="extensionHostToolbar"><span><Wrench size={11} /> Extension Toolbar</span>{toolbarContributions.map((item) => <button type="button" key={`${item.extension.id}-${item.id}`} onClick={() => runContribution(item)} disabled={running}>{item.label}</button>)}</div>}
        <div className="scriptEditorHeader scriptingMainHeader">
          <span><FileCode2 size={13} /> Text Editor</span>
          <div className="scriptToolbar">
            <select aria-label="Script template" defaultValue="" onChange={(event) => { const template = SCRIPT_TEMPLATES.find((item) => item.id === event.target.value); if (template) setScript(template.code); event.target.value = ""; }}>
              <option value="">Templates</option>
              {SCRIPT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <button type="button" title="Copy script" onClick={copyScript}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>
            <button type="button" onClick={() => setScript("")} title="Clear editor"><Trash2 size={12} /></button>
            {running ? <button type="button" className="scriptStopButton" onClick={stopRun}><Square size={11} /> Stop</button> : <button type="button" className="scriptRunButton" onClick={() => runSource(script, "Text Editor")}><Play size={11} /> Run Script</button>}
          </div>
        </div>
        <div className="scriptCodeEditor">
          <div className="scriptLineNumbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
          <textarea value={script} spellCheck={false} onChange={(event) => setScript(event.target.value)} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runSource(script, "Text Editor"); }
            if (event.key === "Tab") { event.preventDefault(); const target = event.currentTarget; const start = target.selectionStart; const end = target.selectionEnd; setScript((current) => `${current.slice(0, start)}  ${current.slice(end)}`); requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2; }); }
          }} aria-label="MultiView JavaScript editor" />
        </div>
        <div className="scriptConsolePanel">
          <div className="scriptEditorHeader"><span><Terminal size={13} /> Developer Console</span><div><button type="button" onClick={() => setConsoleLines([])}>Clear</button></div></div>
          <div className="scriptConsoleOutput">{consoleLines.length ? consoleLines.map((line) => <div key={line.id} className={`consoleLine ${line.level}`}><span>{line.level}</span><pre>{line.text}</pre></div>) : <div className="consoleEmpty">Console cleared.</div>}</div>
        </div>
      </main>

      <aside className="scriptingApiPane extensionPlatformInspector">
        <div className="scriptEditorHeader"><span><Package size={13} /> Extension Platform V2</span></div>
        <div className="scriptRuntimeNotice"><ShieldCheck size={15} /><div><strong>Sandboxed worker runtime</strong><small>No DOM/network globals. Scene changes use the permission-aware host command bridge. Scripts have a 12 second runtime limit.</small></div></div>
        <div className="extensionProfilerCard">
          <div className="extensionProfilerTitle"><Gauge size={12} /><strong>Performance Profiler</strong></div>
          {selectedExtension ? <><span>Extension <b>{selectedExtension.name}</b></span><span>Runs <b>{selectedProfiler?.runs || 0}</b></span><span>Last <b>{selectedProfiler ? `${Math.round(selectedProfiler.lastMs)} ms` : "—"}</b></span><span>Average <b>{selectedProfiler?.runs ? `${Math.round(selectedProfiler.totalMs / selectedProfiler.runs)} ms` : "—"}</b></span><span>Peak <b>{selectedProfiler ? `${Math.round(selectedProfiler.maxMs)} ms` : "—"}</b></span><span>Errors <b>{selectedProfiler?.errors || 0}</b></span></> : <span>No extension selected.</span>}
        </div>
        <div className="extensionHostRegistry">
          <strong>Registered Host Slots</strong>
          {[["Toolbar", toolbarContributions],["Inspector Panels",hostContributions.inspectorPanels],["Outliner Menu",hostContributions.outlinerMenu],["Importers",hostContributions.importers],["Exporters",hostContributions.exporters],["Generators",hostContributions.generators],["Render Hooks",hostContributions.renderHooks],["Shortcuts",hostContributions.shortcuts]].map(([label, items]) => <div key={label}><span>{label}</span><b>{items.length}</b></div>)}
        </div>
        {hostContributions.inspectorPanels.length > 0 && <div className="extensionContributionSection"><strong>Inspector Panels</strong>{hostContributions.inspectorPanels.map((panel) => <details key={`${panel.extension.id}-${panel.id}`}><summary>{panel.title || panel.label}<ChevronDown size={10} /></summary><div>{(panel.actionIds || []).map((actionId) => { const action = panel.extension.actions?.find((item) => item.id === actionId); return action ? <button type="button" key={actionId} onClick={() => runSource(action.script, `${panel.extension.name} › ${action.label}`, panel.extension.permissions || [], panel.extension.id)} disabled={running}>{action.label}</button> : null; })}</div></details>)}</div>}
        {hostContributions.outlinerMenu.length > 0 && <div className="extensionContributionSection"><strong>Outliner Context Actions</strong>{hostContributions.outlinerMenu.map((item) => <button type="button" key={`${item.extension.id}-${item.id}`} onClick={() => runContribution(item)} disabled={running}>{item.label}</button>)}</div>}
        {hostContributions.importers.length > 0 && <div className="extensionContributionSection"><strong>Registered Importers</strong>{hostContributions.importers.map((item) => <button type="button" key={`${item.extension.id}-${item.id}`} onClick={() => openExtensionImporter(item)} disabled={running}><Upload size={10} /> {item.label} {(item.extensions || []).join(" ")}</button>)}</div>}
        {(hostContributions.generators.length > 0 || hostContributions.exporters.length > 0) && <div className="extensionContributionSection"><strong>Registered Tools</strong>{[...hostContributions.generators, ...hostContributions.exporters].map((item) => <button type="button" key={`${item.extension.id}-${item.id}`} onClick={() => runContribution(item)} disabled={running}>{item.label}</button>)}</div>}
        {hostContributions.shortcuts.length > 0 && <div className="extensionShortcutList"><strong>Custom Shortcuts</strong>{hostContributions.shortcuts.map((item) => <span key={`${item.extension.id}-${item.id}`}><kbd>{item.combo}</kbd>{item.label}</span>)}</div>}
        <div className="scriptApiSection"><strong>Generator API</strong><code>studio.generate.terrain(options)</code><code>studio.generate.tree(options)</code><code>studio.generate.ivy(options)</code><code>studio.generate.cloud(options)</code><code>studio.generate.primitive(type, options)</code></div>
        <div className="scriptApiSection"><strong>Host APIs</strong><code>{"studio.camera.set({...})"}</code><code>studio.scene.transform(id, patch)</code><code>studio.material.update(id, patch)</code><code>studio.lighting.set(patch)</code><code>studio.export.camera()</code></div>
        <div className="scriptSnapshotCard"><strong>Live context</strong><span>Asset: {snapshot?.asset?.type || "none"}</span><span>Selected: {snapshot?.scene?.selectedIds?.length || 0}</span><span>Camera: Az {Math.round(snapshot?.camera?.azimuth || 0)}° · El {Math.round(snapshot?.camera?.elevation || 0)}°</span><span>Scene nodes: {snapshot?.scene?.nodeCount || 0}</span></div>
      </aside>
    </section>
  );
}
