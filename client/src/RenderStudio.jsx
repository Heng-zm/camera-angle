import React, { useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  CircleStop,
  Copy,
  Download,
  Image,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";

const EXTENSION_ENABLED_KEY = "multiview-v8.18-enabled-extensions";
const EXTENSION_CUSTOM_KEY = "multiview-v8.18-custom-extensions";
const EXTENSION_SETTINGS_KEY = "multiview-v8.18-extension-settings";

function safeParseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function activeRenderHooks() {
  const enabled = new Set(safeParseJson(localStorage.getItem(EXTENSION_ENABLED_KEY) || "[]", []));
  const packages = safeParseJson(localStorage.getItem(EXTENSION_CUSTOM_KEY) || "[]", []);
  if (!Array.isArray(packages)) return { before: [], after: [] };
  const hooks = packages
    .filter((item) => enabled.has(item?.manifest?.id))
    .flatMap((item) => (Array.isArray(item?.contributions?.renderHooks) ? item.contributions.renderHooks : []).map((hook) => ({
      ...hook,
      extensionId: item.manifest.id,
      extensionName: item.manifest.name,
      permissions: item.manifest.permissions || [],
    })));
  return {
    before: hooks.filter((item) => item.phase === "before"),
    after: hooks.filter((item) => item.phase === "after"),
  };
}

const QUALITY_PRESETS = {
  draft: { label: "Draft", supersampling: 1, antiAlias: false, shadowQuality: "draft", ambientOcclusion: false, bloom: false },
  standard: { label: "Standard", supersampling: 1, antiAlias: true, shadowQuality: "medium", ambientOcclusion: true, bloom: false },
  high: { label: "High", supersampling: 2, antiAlias: true, shadowQuality: "high", ambientOcclusion: true, bloom: false },
  ultra: { label: "Ultra", supersampling: 3, antiAlias: true, shadowQuality: "ultra", ambientOcclusion: true, bloom: true },
};

const RESOLUTIONS = {
  square1k: { label: "1024 × 1024", width: 1024, height: 1024 },
  square2k: { label: "2048 × 2048", width: 2048, height: 2048 },
  landscape2k: { label: "2048 × 1365", width: 2048, height: 1365 },
  portrait2k: { label: "1365 × 2048", width: 1365, height: 2048 },
  uhd: { label: "3840 × 2160", width: 3840, height: 2160 },
};

const TONE_MAPPINGS = [
  ["aces", "ACES Filmic"],
  ["neutral", "Neutral"],
  ["reinhard", "Reinhard"],
  ["cineon", "Cineon"],
  ["linear", "Linear"],
  ["none", "None"],
];

function safeName(value = "render") {
  return String(value || "render").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "render";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1800);
}

function queueStatusIcon(status) {
  if (status === "done") return <Check size={12} />;
  if (status === "rendering") return <RefreshCw size={12} className="renderSpin" />;
  if (status === "cancelled") return <CircleStop size={12} />;
  return <span className="queueWaitingDot" />;
}

export default function RenderStudio({
  projectName,
  assetReady,
  currentCamera,
  savedCameras = [],
  onApplyCamera,
  onRestoreCamera,
  captureRender,
  lightingConfig,
  onLightingChange,
  onPickHdri,
  onExportCameraJson,
  onExportSceneJson,
  onExportTransformJson,
  onExportPromptTxt,
  onExportProject,
  onCopyCamera,
  snapshot,
  onExecuteCommands,
  onError,
}) {
  const backgroundInputRef = useRef(null);
  const cancelRef = useRef(false);
  const [resolutionPreset, setResolutionPreset] = useState("square2k");
  const [customWidth, setCustomWidth] = useState(2048);
  const [customHeight, setCustomHeight] = useState(2048);
  const [format, setFormat] = useState("png");
  const [qualityPreset, setQualityPreset] = useState("high");
  const [supersampling, setSupersampling] = useState(2);
  const [antiAlias, setAntiAlias] = useState(true);
  const [shadowQuality, setShadowQuality] = useState("high");
  const [toneMapping, setToneMapping] = useState("aces");
  const [exposure, setExposure] = useState(1);
  const [bloom, setBloom] = useState(false);
  const [bloomStrength, setBloomStrength] = useState(0.35);
  const [ambientOcclusion, setAmbientOcclusion] = useState(true);
  const [aoStrength, setAoStrength] = useState(0.35);
  const [contactShadows, setContactShadows] = useState(true);
  const [backgroundMode, setBackgroundMode] = useState("scene");
  const [backgroundColor, setBackgroundColor] = useState("#202124");
  const [backgroundImageFile, setBackgroundImageFile] = useState(null);
  const [queue, setQueue] = useState([]);
  const [running, setRunning] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [lastOutput, setLastOutput] = useState("");

  const size = useMemo(() => {
    if (resolutionPreset === "custom") return { width: Math.max(64, Math.min(8192, Number(customWidth) || 2048)), height: Math.max(64, Math.min(8192, Number(customHeight) || 2048)) };
    return RESOLUTIONS[resolutionPreset] || RESOLUTIONS.square2k;
  }, [resolutionPreset, customWidth, customHeight]);

  function applyQualityPreset(key) {
    setQualityPreset(key);
    const preset = QUALITY_PRESETS[key] || QUALITY_PRESETS.high;
    setSupersampling(preset.supersampling);
    setAntiAlias(preset.antiAlias);
    setShadowQuality(preset.shadowQuality);
    setAmbientOcclusion(preset.ambientOcclusion);
    setBloom(preset.bloom);
  }

  function addCurrentCamera() {
    setQueue((current) => [...current, {
      id: `render-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "Current Camera",
      snapshot: currentCamera,
      status: "waiting",
      progress: 0,
    }]);
  }

  function addSavedCameras() {
    if (!savedCameras.length) return;
    setQueue((current) => [
      ...current,
      ...savedCameras.map((camera, index) => ({
        id: `render-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        name: camera.name || `Camera ${index + 1}`,
        snapshot: camera,
        status: "waiting",
        progress: 0,
      })),
    ]);
  }

  function clearQueue() {
    if (running) return;
    setQueue([]);
    setOverallProgress(0);
    setLastOutput("");
  }

  function updateJob(id, patch) {
    setQueue((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
  }

  async function runRenderHook(hook, label) {
    if (!hook?.script) return;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await new Promise((resolve) => {
      const worker = new Worker(new URL("./scriptRuntime.worker.js", import.meta.url), { type: "module" });
      const timer = window.setTimeout(() => { worker.terminate(); resolve(); }, 6000);
      const finish = () => { window.clearTimeout(timer); worker.terminate(); resolve(); };
      worker.onerror = finish;
      worker.onmessage = async (event) => {
        const data = event.data || {};
        if (data.id !== runId) return;
        try { if (data.commands?.length) await onExecuteCommands?.(data.commands); } catch { /* hook failures should not crash the render queue */ }
        finish();
      };
      const allSettings = safeParseJson(localStorage.getItem(EXTENSION_SETTINGS_KEY) || "{}", {});
      worker.postMessage({ id: runId, source: hook.script, snapshot: { ...(snapshot || {}), extension: { id: hook.extensionId, settings: allSettings?.[hook.extensionId] || {} } }, permissions: hook.permissions || [] });
    });
  }

  async function runHooks(phase) {
    const hooks = activeRenderHooks()[phase] || [];
    for (const hook of hooks) {
      if (cancelRef.current) break;
      await runRenderHook(hook, `${hook.extensionName} › ${hook.label || phase}`);
    }
  }

  async function runQueue() {
    if (!assetReady || running) {
      if (!assetReady) onError?.("Load a ready 3D model before starting Render Studio.");
      return;
    }
    const jobs = queue.length ? queue : [{ id: `render-${Date.now()}`, name: "Current Camera", snapshot: currentCamera, status: "waiting", progress: 0 }];
    if (!queue.length) setQueue(jobs);
    cancelRef.current = false;
    setRunning(true);
    setOverallProgress(0);
    setLastOutput("");
    const original = currentCamera;
    const outputs = [];

    try {
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        if (cancelRef.current) {
          updateJob(job.id, { status: "cancelled", progress: 0 });
          continue;
        }
        updateJob(job.id, { status: "rendering", progress: 10 });
        await onApplyCamera?.(job.snapshot);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        updateJob(job.id, { progress: 32 });
        await new Promise((resolve) => setTimeout(resolve, 40));
        if (cancelRef.current) {
          updateJob(job.id, { status: "cancelled", progress: 0 });
          continue;
        }
        updateJob(job.id, { progress: 48 });
        await runHooks("before");
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        updateJob(job.id, { progress: 58 });
        const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
        const transparent = backgroundMode === "transparent" && format === "png";
        const blob = await captureRender?.({
          width: size.width,
          height: size.height,
          mimeType,
          quality: format === "png" ? 1 : 0.94,
          supersampling,
          antiAlias,
          shadowQuality,
          shadows: shadowQuality !== "off",
          toneMapping,
          exposure,
          bloom,
          bloomStrength,
          ambientOcclusion,
          ambientOcclusionStrength: aoStrength,
          contactShadows,
          transparent,
          backgroundColor: backgroundMode === "color" ? backgroundColor : undefined,
          backgroundImageFile: backgroundMode === "image" ? backgroundImageFile : undefined,
          backgroundHdri: backgroundMode === "hdri",
        });
        if (!blob) throw new Error(`Render job "${job.name}" returned no image.`);
        if (cancelRef.current) {
          updateJob(job.id, { status: "cancelled", progress: 0 });
          break;
        }
        updateJob(job.id, { progress: 86 });
        await runHooks("after");
        updateJob(job.id, { progress: 92 });
        const extension = format === "jpeg" ? "jpg" : format;
        outputs.push({ name: `${String(index + 1).padStart(2, "0")}-${safeName(job.name)}.${extension}`, blob });
        updateJob(job.id, { status: "done", progress: 100 });
        setOverallProgress(Math.round(((index + 1) / jobs.length) * 100));
      }

      if (outputs.length === 1 && !cancelRef.current) {
        downloadBlob(outputs[0].blob, `${safeName(projectName)}-${outputs[0].name}`);
        setLastOutput(outputs[0].name);
      } else if (outputs.length > 1) {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        outputs.forEach((output) => zip.file(output.name, output.blob));
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        downloadBlob(blob, `${safeName(projectName)}-render-queue.zip`);
        setLastOutput(`${outputs.length} renders · ZIP`);
      }
    } catch (error) {
      onError?.(`Render queue failed: ${error?.message || error}`);
    } finally {
      await onRestoreCamera?.(original);
      setRunning(false);
      cancelRef.current = false;
    }
  }

  function cancelQueue() {
    cancelRef.current = true;
    setQueue((current) => current.map((job) => job.status === "waiting" ? { ...job, status: "cancelled" } : job));
  }

  return (
    <section className="renderStudioWorkspace" aria-label="Render Studio">
      <aside className="renderSettingsPane">
        <div className="renderPaneHeader"><span><Settings2 size={13} /> Render Settings</span><em>V8.15</em></div>

        <div className="renderSection">
          <label className="renderField"><span>Resolution</span><select value={resolutionPreset} onChange={(event) => setResolutionPreset(event.target.value)}>{Object.entries(RESOLUTIONS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}<option value="custom">Custom</option></select></label>
          {resolutionPreset === "custom" && <div className="renderSizeGrid"><label><span>Width</span><input type="number" min="64" max="8192" value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} /></label><label><span>Height</span><input type="number" min="64" max="8192" value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} /></label></div>}
          <div className="renderSegmented">{["png", "jpeg", "webp"].map((item) => <button key={item} type="button" className={format === item ? "active" : ""} onClick={() => setFormat(item)}>{item === "jpeg" ? "JPEG" : item.toUpperCase()}</button>)}</div>
        </div>

        <div className="renderSection">
          <div className="renderSectionTitle"><strong>Quality</strong><small>{QUALITY_PRESETS[qualityPreset]?.label}</small></div>
          <div className="renderSegmented qualitySegments">{Object.entries(QUALITY_PRESETS).map(([key, item]) => <button key={key} type="button" className={qualityPreset === key ? "active" : ""} onClick={() => applyQualityPreset(key)}>{item.label}</button>)}</div>
          <label className="renderRange"><span>Supersampling <b>{supersampling}×</b></span><input type="range" min="1" max="4" step="1" value={supersampling} onChange={(event) => { setSupersampling(Number(event.target.value)); setQualityPreset("custom"); }} /></label>
          <div className="renderToggleRow"><button type="button" className={antiAlias ? "active" : ""} onClick={() => setAntiAlias((value) => !value)}>Anti-aliasing</button><button type="button" className={contactShadows ? "active" : ""} onClick={() => setContactShadows((value) => !value)}>Contact shadows</button></div>
          <label className="renderField"><span>Shadow quality</span><select value={shadowQuality} onChange={(event) => setShadowQuality(event.target.value)}><option value="off">Off</option><option value="draft">Draft</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
        </div>

        <div className="renderSection">
          <div className="renderSectionTitle"><strong>Color & Effects</strong><small>Post/render controls</small></div>
          <label className="renderField"><span>Tone mapping</span><select value={toneMapping} onChange={(event) => setToneMapping(event.target.value)}>{TONE_MAPPINGS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="renderRange"><span>Exposure <b>{Number(exposure).toFixed(2)}</b></span><input type="range" min="0.1" max="3" step="0.05" value={exposure} onChange={(event) => setExposure(Number(event.target.value))} /></label>
          <div className="renderToggleRow"><button type="button" className={bloom ? "active" : ""} onClick={() => setBloom((value) => !value)}>Bloom</button><button type="button" className={ambientOcclusion ? "active" : ""} onClick={() => setAmbientOcclusion((value) => !value)}>Ambient occlusion</button></div>
          {bloom && <label className="renderRange"><span>Bloom <b>{Number(bloomStrength).toFixed(2)}</b></span><input type="range" min="0.05" max="1.5" step="0.05" value={bloomStrength} onChange={(event) => setBloomStrength(Number(event.target.value))} /></label>}
          {ambientOcclusion && <label className="renderRange"><span>AO strength <b>{Number(aoStrength).toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.05" value={aoStrength} onChange={(event) => setAoStrength(Number(event.target.value))} /></label>}
        </div>

        <div className="renderSection">
          <div className="renderSectionTitle"><strong>Background</strong><small>Scene / transparent / image / HDRI</small></div>
          <div className="renderBackgroundGrid">{[["scene","Scene"],["transparent","Transparent"],["color","Color"],["image","Image"],["hdri","HDRI"]].map(([key,label]) => <button type="button" key={key} className={backgroundMode === key ? "active" : ""} onClick={() => { setBackgroundMode(key); if (key === "hdri") onPickHdri?.(); }}>{label}</button>)}</div>
          {backgroundMode === "color" && <label className="renderColorField"><span>Color</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /><code>{backgroundColor}</code></label>}
          {backgroundMode === "image" && <><button type="button" className="renderFileButton" onClick={() => backgroundInputRef.current?.click()}><Image size={12} /> {backgroundImageFile ? backgroundImageFile.name : "Choose background image"}</button><input ref={backgroundInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBackgroundImageFile(event.target.files?.[0] || null)} /></>}
          {backgroundMode === "hdri" && <div className="renderHdriInfo"><Sparkles size={12} /><span>Uses Lighting Studio HDR/EXR environment.</span></div>}
          <div className="renderLightingCompact"><span>Environment {Number(lightingConfig?.environmentStrength || 0).toFixed(2)}</span><button type="button" onClick={() => onLightingChange?.({ transparentBackground: backgroundMode === "transparent" })}>Sync scene</button></div>
        </div>
      </aside>

      <main className="renderQueuePane">
        <div className="renderPaneHeader renderQueueHeader"><span><Layers3 size={13} /> Render Queue</span><div><button type="button" onClick={addCurrentCamera}><Plus size={11} /> Current</button><button type="button" onClick={addSavedCameras} disabled={!savedCameras.length}><Camera size={11} /> Saved cameras</button><button type="button" onClick={clearQueue} disabled={running || !queue.length}><Trash2 size={11} /> Clear</button></div></div>

        <div className="renderSummaryCards">
          <div><span>Output</span><b>{size.width} × {size.height}</b></div>
          <div><span>Format</span><b>{format === "jpeg" ? "JPEG" : format.toUpperCase()}</b></div>
          <div><span>Quality</span><b>{QUALITY_PRESETS[qualityPreset]?.label || "Custom"}</b></div>
          <div><span>Queue</span><b>{queue.length || 1} shot{(queue.length || 1) === 1 ? "" : "s"}</b></div>
        </div>

        <div className="renderQueueList">
          {(queue.length ? queue : [{ id: "preview-current", name: "Current Camera", status: "waiting", progress: 0 }]).map((job) => (
            <div className={`renderQueueItem status-${job.status}`} key={job.id}>
              <span className="renderQueueState">{queueStatusIcon(job.status)}</span>
              <div className="renderQueueInfo"><strong>{job.name}</strong><small>{size.width}×{size.height} · {format.toUpperCase()} · {supersampling}× SSAA</small></div>
              <div className="renderQueueProgress"><span style={{ width: `${job.progress || 0}%` }} /><b>{job.status === "rendering" ? `${job.progress || 0}%` : job.status === "done" ? "Done" : job.status === "cancelled" ? "Cancelled" : "Waiting"}</b></div>
            </div>
          ))}
        </div>

        <div className="renderQueueFooter">
          <div className="overallRenderProgress"><span style={{ width: `${overallProgress}%` }} /></div>
          <div><span>{running ? `Rendering ${overallProgress}%` : lastOutput ? `Last output: ${lastOutput}` : "Ready to render"}</span>{running ? <button type="button" className="renderCancelButton" onClick={cancelQueue}><CircleStop size={12} /> Cancel</button> : <button type="button" className="renderStartButton" onClick={runQueue} disabled={!assetReady}><Play size={12} /> Render Queue</button>}</div>
        </div>
      </main>

      <aside className="renderExportPane">
        <div className="renderPaneHeader"><span><Download size={13} /> Export Studio</span><em>V8.9+</em></div>
        <div className="renderExportActions">
          <button type="button" onClick={onExportCameraJson}><Download size={12} /><span><b>Camera JSON</b><small>Target camera settings</small></span></button>
          <button type="button" onClick={onExportSceneJson}><Download size={12} /><span><b>Scene JSON</b><small>Hierarchy and studio state</small></span></button>
          <button type="button" onClick={onExportTransformJson}><Download size={12} /><span><b>Transform JSON</b><small>Object transform state</small></span></button>
          <button type="button" onClick={onExportPromptTxt}><Download size={12} /><span><b>Prompt TXT</b><small>Target camera prompt</small></span></button>
          <button type="button" onClick={onExportProject}><Download size={12} /><span><b>.multiview Project</b><small>Portable project configuration</small></span></button>
          <button type="button" onClick={onCopyCamera}><Copy size={12} /><span><b>Copy Camera</b><small>Clipboard camera configuration</small></span></button>
        </div>
        <div className="renderExportNote"><strong>Batch camera renders</strong><p>Add saved cameras to the queue. Multiple completed shots are automatically packed into a ZIP.</p></div>
      </aside>
    </section>
  );
}
