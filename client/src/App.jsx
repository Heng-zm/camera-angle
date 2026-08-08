import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Aperture,
  Box,
  Camera,
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  ImagePlus,
  Layers,
  Lightbulb,
  Lock,
  Orbit,
  Palette,
  Rotate3d,
  RotateCcw,
  Save,
  Search,
  SunMedium,
  Trash2,
  Unlock,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import ViewportErrorBoundary from "./ViewportErrorBoundary.jsx";
const ThreeModelViewport = lazy(() => import("./ThreeModelViewport.jsx"));

const ANGLES = [
  { key: "front", label: "Front", deg: "0°", hint: "Straight" },
  { key: "front15", label: "Front 15°", deg: "15°", hint: "Slight turn" },
  { key: "front30", label: "Front 30°", deg: "30°", hint: "Light 3/4" },
  { key: "front45", label: "Front 45°", deg: "45°", hint: "Classic 3/4" },
  { key: "front60", label: "Front 60°", deg: "60°", hint: "Front-side" },
  { key: "side90", label: "Side", deg: "90°", hint: "Profile" },
  { key: "rear135", label: "Rear 135°", deg: "135°", hint: "Rear 3/4" },
  { key: "back180", label: "Back", deg: "180°", hint: "Rear" },
  { key: "left45", label: "Left 45°", deg: "−45°", hint: "Opposite 3/4" },
  { key: "top45", label: "Top 45°", deg: "↘", hint: "Elevated" },
  { key: "top", label: "Top", deg: "90°↓", hint: "Bird's-eye" },
  { key: "low", label: "Low", deg: "↗", hint: "Looking up" },
];


const TARGET_CAMERA_SPECS = {
  front: { azimuth: 0, elevation: 0, distance: "Auto" },
  front15: { azimuth: 15, elevation: 0, distance: "Auto" },
  front30: { azimuth: 30, elevation: 0, distance: "Auto" },
  front45: { azimuth: 45, elevation: 0, distance: "Auto" },
  front60: { azimuth: 60, elevation: 0, distance: "Auto" },
  side90: { azimuth: 90, elevation: 0, distance: "Auto" },
  rear135: { azimuth: 135, elevation: 0, distance: "Auto" },
  back180: { azimuth: 180, elevation: 0, distance: "Auto" },
  left45: { azimuth: 315, elevation: 0, distance: "Auto" },
  top45: { azimuth: 0, elevation: 45, distance: "Auto" },
  top: { azimuth: 0, elevation: 90, distance: "Auto" },
  low: { azimuth: 0, elevation: -25, distance: "Auto" },
};

const MODEL_EXTENSIONS = ["obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds"];
const MODEL_COMPANION_EXTENSIONS = ["mtl", "bin", "drc", "png", "jpg", "jpeg", "webp", "bmp", "tga", "dds", "ktx2", "gif", "tif", "tiff"];
const FILE_ACCEPT = [
  "image/png", "image/jpeg", "image/webp",
  ...MODEL_EXTENSIONS.map((ext) => `.${ext}`),
  ...MODEL_COMPANION_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_MODEL_BUNDLE_BYTES = 500 * 1024 * 1024;

function extensionFromName(name = "") {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function isSupportedModelFile(file) {
  return Boolean(file && MODEL_EXTENSIONS.includes(extensionFromName(file.name)));
}

function fileStem(name = "") {
  const base = String(name || "").replace(/\\/g, "/").split("/").pop() || "";
  const index = base.lastIndexOf(".");
  return (index > 0 ? base.slice(0, index) : base).toLowerCase();
}

function selectPrimaryModel(files = []) {
  const models = files.filter((item) => isSupportedModelFile(item));
  if (!models.length) return null;
  const mtls = files.filter((item) => extensionFromName(item.name) === "mtl");
  const objWithMtl = models.find((item) => extensionFromName(item.name) === "obj" && mtls.some((mtl) => fileStem(mtl.name) === fileStem(item.name)));
  if (objWithMtl) return objWithMtl;
  const priority = ["glb", "gltf", "obj", "fbx", "dae", "3ds", "3mf", "ply", "stl"];
  for (const ext of priority) {
    const found = models.find((item) => extensionFromName(item.name) === ext);
    if (found) return found;
  }
  return models[0];
}

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}


const CAMERA_PRESET_CARDS = [
  {
    key: "productHero",
    title: "Product Hero",
    subtitle: "Clean 3/4 hero shot",
    azimuth: 42,
    elevation: 16,
    distance: 36,
    lens: "85mm",
    focus: "center",
  },
  {
    key: "foodTop",
    title: "Food Top-down",
    subtitle: "Menu / catalog look",
    azimuth: 0,
    elevation: 66,
    distance: 48,
    lens: "35mm",
    focus: "center",
  },
  {
    key: "sideProfile",
    title: "Side Profile",
    subtitle: "Clear silhouette",
    azimuth: 90,
    elevation: 4,
    distance: 44,
    lens: "50mm",
    focus: "center",
  },
  {
    key: "macroClose",
    title: "Close Product",
    subtitle: "Tighter crop / detail",
    azimuth: 28,
    elevation: 18,
    distance: 18,
    lens: "105mm",
    focus: "front",
  },
];

const LENS_PRESETS = [
  { key: "24mm", label: "24mm", description: "Wide field of view" },
  { key: "35mm", label: "35mm", description: "Natural wide product view" },
  { key: "50mm", label: "50mm", description: "Standard perspective" },
  { key: "85mm", label: "85mm", description: "Classic product / portrait" },
  { key: "105mm", label: "105mm", description: "Tight close-up perspective" },
];

const FOCUS_POINTS = [
  { key: "center", label: "Center" },
  { key: "front", label: "Front detail" },
  { key: "top", label: "Top detail" },
  { key: "logo", label: "Logo / label" },
];

function focusPresetPosition(key) {
  if (key === "front") return { x: 50, y: 62 };
  if (key === "top") return { x: 50, y: 34 };
  if (key === "logo") return { x: 58, y: 46 };
  return { x: 50, y: 49 };
}

const CAMERA_GIZMO_VIEWS = [
  { key: "top", label: "Top", azimuth: 0, elevation: 65, distance: 48 },
  { key: "left", label: "Left", azimuth: 270, elevation: 0, distance: 42 },
  { key: "front", label: "Front", azimuth: 0, elevation: 0, distance: 42 },
  { key: "right", label: "Right", azimuth: 90, elevation: 0, distance: 42 },
  { key: "back", label: "Back", azimuth: 180, elevation: 0, distance: 44 },
  { key: "low", label: "Low", azimuth: 0, elevation: -24, distance: 40 },
];


function fileExtension(mimeType = "") {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAzimuth(value) {
  return ((value % 360) + 360) % 360;
}

function snapAngle(value, step = 15) {
  return normalizeAzimuth(Math.round(value / step) * step);
}

function angleDelta(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function describeCamera({ azimuth, elevation, distance }) {
  const absAz = ((azimuth % 360) + 360) % 360;

  let horizontal = "front view";
  if (absAz >= 22.5 && absAz < 67.5) horizontal = "front-right three-quarter view";
  else if (absAz >= 67.5 && absAz < 112.5) horizontal = "right side view";
  else if (absAz >= 112.5 && absAz < 157.5) horizontal = "rear-right three-quarter view";
  else if (absAz >= 157.5 && absAz < 202.5) horizontal = "back view";
  else if (absAz >= 202.5 && absAz < 247.5) horizontal = "rear-left three-quarter view";
  else if (absAz >= 247.5 && absAz < 292.5) horizontal = "left side view";
  else if (absAz >= 292.5 && absAz < 337.5) horizontal = "front-left three-quarter view";

  let vertical = "eye-level shot";
  if (elevation >= 55) vertical = "bird's-eye shot";
  else if (elevation >= 28) vertical = "elevated shot";
  else if (elevation <= -22) vertical = "low-angle shot";
  else if (elevation <= -8) vertical = "slightly low-angle shot";

  let distanceLabel = "medium shot";
  if (distance <= 25) distanceLabel = "extreme close-up";
  else if (distance <= 42) distanceLabel = "close-up";
  else if (distance <= 65) distanceLabel = "medium shot";
  else if (distance <= 82) distanceLabel = "wide shot";
  else distanceLabel = "far wide shot";

  const short = `${horizontal} ${vertical} ${distanceLabel}`;
  const detailed = `Use a ${horizontal} with a ${vertical} and ${distanceLabel}. Keep the perspective realistic and consistent with a real camera moving around the same subject.`;

  return {
    short,
    detailed,
    label: `Az ${Math.round(azimuth)}° · El ${Math.round(elevation)}° · Dist ${Math.round(distance)}%`,
  };
}

function nearestPresetFromCamera({ azimuth, elevation }) {
  if (elevation >= 52) return "top";
  if (elevation >= 24) return "top45";
  if (elevation <= -18) return "low";

  const candidateAngles = [
    [0, "front"],
    [15, "front15"],
    [30, "front30"],
    [45, "front45"],
    [60, "front60"],
    [90, "side90"],
    [135, "rear135"],
    [180, "back180"],
    [315, "left45"],
  ];

  let best = candidateAngles[0][1];
  let bestDiff = Infinity;
  for (const [deg, key] of candidateAngles) {
    const diff = angleDelta(azimuth, deg);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = key;
    }
  }
  return best;
}


const VIEW_DESCRIPTIONS = {
  front: "straight-on front view at eye level",
  front15: "slight front three-quarter view, about 15° around the subject",
  front30: "front three-quarter view, about 30° around the subject",
  front45: "classic front three-quarter view, about 45° around the subject",
  front60: "front-side view, about 60° around the subject",
  side90: "true right-side profile view, about 90° around the subject",
  rear135: "rear three-quarter view, about 135° around the subject",
  back180: "straight-on back view, about 180° around the subject",
  left45: "front-left three-quarter view, about 45° to the left",
  top45: "elevated 45° view looking down at the subject",
  top: "top-down bird's-eye view directly above the subject",
  low: "low-angle view looking slightly upward at the subject",
};

function viewDescription(key) {
  return VIEW_DESCRIPTIONS[key] || key;
}

function isCameraNearPreset(camera, preset) {
  return angleDelta(camera.azimuth, preset.azimuth) <= 12
    && Math.abs(camera.elevation - preset.elevation) <= 12
    && Math.abs(camera.distance - preset.distance) <= 10;
}

function numberOr(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function framingDescription(size) {
  if (size === "1536x1024") return "landscape 3:2 framing";
  if (size === "1024x1536") return "portrait 2:3 framing";
  return "square 1:1 framing";
}

function backgroundPrompt(background) {
  return background === "white"
    ? "Use a seamless pure white studio background with soft, realistic lighting and a natural contact shadow."
    : "Keep the original background, surface, lighting character, and scene style as closely as possible.";
}

function lensPrompt(lensPreset) {
  const found = LENS_PRESETS.find((item) => item.key === lensPreset);
  if (!found) return "50mm standard lens.";
  return `${found.label} lens / field of view (${found.description.toLowerCase()}).`;
}

function focusPrompt(focusPoint, focusPosition = { x: 50, y: 49 }) {
  if (focusPoint === "custom") {
    return `Place the camera focus target at approximately ${Math.round(focusPosition.x)}% from the left and ${Math.round(focusPosition.y)}% from the top of the subject framing, and keep that area crisp without changing the subject.`;
  }
  if (focusPoint === "front") return "Keep focus priority on the front-most visible details of the subject.";
  if (focusPoint === "top") return "Keep focus priority on the upper/top visible details of the subject.";
  if (focusPoint === "logo") return "Keep focus priority on the logo, label, or primary branding area when visible.";
  return "Keep the main subject centered and in clear focus.";
}

function focusBadgeText(focusPoint, focusPosition = { x: 50, y: 49 }) {
  if (focusPoint === "custom") return `Custom ${Math.round(focusPosition.x)}% · ${Math.round(focusPosition.y)}%`;
  return FOCUS_POINTS.find((item) => item.key === focusPoint)?.label || "Center";
}

function lensLabel(lensPreset) {
  return LENS_PRESETS.find((item) => item.key === lensPreset)?.label || lensPreset;
}

function getTargetCameraSpec({ targetKey, camera, cameraSummary, lensPreset, focusPoint, focusPosition, size, projectionMode = "perspective" }) {
  const isCustom = targetKey === "custom3d";
  const preset = TARGET_CAMERA_SPECS[targetKey] || TARGET_CAMERA_SPECS.front;
  return {
    view: isCustom ? cameraSummary.short : viewDescription(targetKey),
    azimuth: isCustom ? Math.round(camera.azimuth) : preset.azimuth,
    elevation: isCustom ? Math.round(camera.elevation) : preset.elevation,
    distance: isCustom ? `${Math.round(camera.distance)}%` : `${preset.distance} · match requested framing`,
    lens: lensLabel(lensPreset),
    projection: projectionMode === "orthographic" ? "Orthographic" : "Perspective",
    focus: focusBadgeText(focusPoint, focusPosition),
    framing: framingDescription(size),
  };
}

function targetCameraBlock(spec) {
  return [
    "Target camera:",
    `View: ${spec.view}`,
    `Azimuth: ${spec.azimuth}°`,
    `Elevation: ${spec.elevation}°`,
    `Distance: ${spec.distance}`,
    `Lens / FOV: ${spec.lens}`,
    `Projection: ${spec.projection}`,
    `Focus target: ${spec.focus}`,
    `Framing: ${spec.framing}`,
  ].join("\n");
}

function targetViewText(targetKey, camera, cameraSummary, lensPreset, focusPoint, focusPosition, size = "1024x1024", projectionMode = "perspective") {
  const spec = getTargetCameraSpec({ targetKey, camera, cameraSummary, lensPreset, focusPoint, focusPosition, size, projectionMode });
  return `${spec.view}; Az ${spec.azimuth}° · El ${spec.elevation}° · Dist ${spec.distance} · ${spec.lens} · Focus ${spec.focus}`;
}

function modelTransformPrompt(transform) {
  const normalized = normalizeProjectTransform(transform);
  return `Object transform: Position X ${normalized.position.x.toFixed(2)}, Y ${normalized.position.y.toFixed(2)}, Z ${normalized.position.z.toFixed(2)}; Rotation X ${normalized.rotation.x.toFixed(1)}°, Y ${normalized.rotation.y.toFixed(1)}°, Z ${normalized.rotation.z.toFixed(1)}°; Scale X ${normalized.scale.x.toFixed(3)}, Y ${normalized.scale.y.toFixed(3)}, Z ${normalized.scale.z.toFixed(3)}. Preserve this transformed pose/orientation in the target render.`;
}

function buildLocalPrompt({ currentViewKey, targetKey, camera, cameraSummary, background, size, customPrompt, lensPreset, focusPoint, focusPosition, assetType = "image", modelFormat = "", projectionMode = "perspective", modelTransform = DEFAULT_MODEL_TRANSFORM }) {
  const currentView = assetType === "model"
    ? `3D model asset${modelFormat ? ` (${modelFormat.toUpperCase()})` : ""} with no fixed source-camera viewpoint`
    : viewDescription(currentViewKey);
  const targetSpec = getTargetCameraSpec({
    targetKey,
    camera,
    cameraSummary,
    lensPreset,
    focusPoint,
    focusPosition,
    size,
    projectionMode: assetType === "model" ? projectionMode : "perspective",
  });

  return [
    assetType === "model"
      ? "Use the provided 3D model, or a clean render of that same model, as a strict geometry/material reference for the exact same subject or product."
      : "Use the uploaded image as a strict visual/identity reference for the exact same subject or product.",
    `Current/source reference: ${currentView}.`,
    targetCameraBlock(targetSpec),
    assetType === "model" ? modelTransformPrompt(modelTransform) : "",
    `Camera target / focus point instruction: ${focusPrompt(focusPoint, focusPosition)}`,
    assetType === "model"
      ? "Render the same 3D geometry FROM the Target camera specification above. Do not alter the model geometry, proportions, topology, materials, textures, UV appearance, labels, logos, or distinctive details."
      : "Transform the image FROM the stated current/source camera view TO the Target camera specification above.",
    "Treat every value in the Target camera block as an explicit camera instruction. Do not substitute a different viewpoint, lens, projection, focus target, distance, or framing.",
    "Change ONLY the camera viewpoint, perspective, framing, lens feel, and focus priority. Do not change the subject itself.",
    "Do not redesign, replace, stylize, mirror, stretch, deform, add to, remove from, or otherwise alter the main subject.",
    "Preserve the exact visible silhouette, proportions, colors, materials, textures, surface finish, packaging, labels, logos, readable text placement, contents, liquid layers, toppings, accessories, seams, hardware, wear, defects, and other distinctive details when present.",
    "Keep logos, branding, and readable text correctly oriented and in the same physical locations when visible from the new viewpoint. Do not invent new text or branding.",
    assetType === "image" ? "Infer only genuinely hidden surfaces, and keep those inferred areas conservative, physically plausible, and consistent with the reference." : "Preserve the loaded model geometry exactly; do not invent geometry that is not in the model.",
    "Preserve the original material character and overall photography/rendering style unless the requested background requires a change.",
    backgroundPrompt(background),
    "Create one clean, photorealistic result with no captions, comparison layout, decorative additions, or explanatory text in the image.",
    customPrompt?.trim() ? `Additional instruction: ${customPrompt.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

const DEFAULT_MODEL_TRANSFORM = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const DEFAULT_LIGHTING = {
  preset: "studio",
  environmentStrength: 1,
  environmentRotation: 0,
  keyIntensity: 3.2,
  fillIntensity: 1.05,
  rimIntensity: 0.75,
  ambientIntensity: 0.16,
  temperature: 6500,
  shadows: true,
  transparentBackground: false,
};

const DEFAULT_EXPORT = {
  format: "png",
  scale: 1,
  customWidth: 1920,
  customHeight: 1080,
  transparent: false,
  quality: 0.94,
};

const LIGHTING_PRESETS = [
  { key: "studio", label: "Studio HDRI", sub: "Balanced product lighting" },
  { key: "neutral", label: "Neutral", sub: "Flat neutral environment" },
  { key: "softbox", label: "Softbox", sub: "Soft commercial highlights" },
  { key: "outdoor", label: "Outdoor", sub: "Brighter ambient fill" },
  { key: "dark", label: "Dark Studio", sub: "Low-key contrast" },
  { key: "custom", label: "Custom HDRI", sub: "Upload HDR / EXR" },
];

const LIGHTING_RECIPES = {
  studio: { preset: "studio", environmentStrength: 1, keyIntensity: 3.2, fillIntensity: 1.05, rimIntensity: 0.75, ambientIntensity: 0.16, temperature: 6500 },
  neutral: { preset: "neutral", environmentStrength: 0.75, keyIntensity: 2.25, fillIntensity: 1.4, rimIntensity: 0.35, ambientIntensity: 0.28, temperature: 6500 },
  softbox: { preset: "softbox", environmentStrength: 1.2, keyIntensity: 2.4, fillIntensity: 1.65, rimIntensity: 0.55, ambientIntensity: 0.2, temperature: 5600 },
  outdoor: { preset: "outdoor", environmentStrength: 0.35, keyIntensity: 4.2, fillIntensity: 1.15, rimIntensity: 0.25, ambientIntensity: 0.42, temperature: 6200 },
  dark: { preset: "dark", environmentStrength: 0.2, keyIntensity: 2.9, fillIntensity: 0.3, rimIntensity: 1.45, ambientIntensity: 0.04, temperature: 5000 },
};

function cloneDefaultModelTransform() {
  return {
    position: { ...DEFAULT_MODEL_TRANSFORM.position },
    rotation: { ...DEFAULT_MODEL_TRANSFORM.rotation },
    scale: { ...DEFAULT_MODEL_TRANSFORM.scale },
  };
}

function safeProjectName(value = "") {
  const cleaned = String(value || "Untitled Camera Studio").trim().replace(/[\\/:*?"<>|]+/g, "-");
  return cleaned || "Untitled Camera Studio";
}

function projectFileName(name, extension) {
  return `${safeProjectName(name).replace(/\s+/g, "-").toLowerCase()}.${extension}`;
}

function normalizeProjectTransform(value) {
  const safe = (input, fallback) => Number.isFinite(Number(input)) ? Number(input) : fallback;
  return {
    position: {
      x: safe(value?.position?.x, 0),
      y: safe(value?.position?.y, 0),
      z: safe(value?.position?.z, 0),
    },
    rotation: {
      x: safe(value?.rotation?.x, 0),
      y: safe(value?.rotation?.y, 0),
      z: safe(value?.rotation?.z, 0),
    },
    scale: {
      x: Math.max(0.001, safe(value?.scale?.x, 1)),
      y: Math.max(0.001, safe(value?.scale?.y, 1)),
      z: Math.max(0.001, safe(value?.scale?.z, 1)),
    },
  };
}


function filterSceneTree(node, query = "") {
  if (!node) return null;
  const text = String(query || "").trim().toLowerCase();
  if (!text) return node;
  const children = (node.children || []).map((child) => filterSceneTree(child, text)).filter(Boolean);
  if (String(node.name || "").toLowerCase().includes(text) || String(node.type || "").toLowerCase().includes(text) || children.length) {
    return { ...node, children };
  }
  return null;
}

function countSceneNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countSceneNodes(child), 0);
}

function App() {
  const inputRef = useRef(null);
  const projectFileInputRef = useRef(null);
  const environmentInputRef = useRef(null);
  const materialTextureInputRef = useRef(null);
  const relinkFilesInputRef = useRef(null);
  const threeViewportRef = useRef(null);
  const cameraStageRef = useRef(null);
  const orbitDragRef = useRef(null);
  const inertiaFrameRef = useRef(null);
  const autoOrbitFrameRef = useRef(null);
  const dragDepthRef = useRef(0);
  const [angleMode, setAngleMode] = useState("preset");
  const [file, setFile] = useState(null);
  const [fileBundle, setFileBundle] = useState([]);
  const [assetType, setAssetType] = useState("image");
  const [preview, setPreview] = useState("");
  const [modelInfo, setModelInfo] = useState(null);
  const [modelLoadState, setModelLoadState] = useState({ status: "idle", progress: 0, label: "" });
  const [viewportProjection, setViewportProjection] = useState("perspective");
  const [viewportShading, setViewportShading] = useState("material");
  const [viewportGrid, setViewportGrid] = useState(true);
  const [viewportGround, setViewportGround] = useState(true);
  const [modelTransformResetSignal, setModelTransformResetSignal] = useState(0);
  const [modelTransform, setModelTransform] = useState(() => cloneDefaultModelTransform());
  const [selectedModelObject, setSelectedModelObject] = useState(null);
  const [selectedSceneIds, setSelectedSceneIds] = useState([]);
  const [sceneGraph, setSceneGraph] = useState(null);
  const [outlinerSearch, setOutlinerSearch] = useState("");
  const [collapsedSceneIds, setCollapsedSceneIds] = useState(() => new Set());
  const [materialInfo, setMaterialInfo] = useState({ selectedIds: [], materials: [] });
  const [activeMaterialId, setActiveMaterialId] = useState("");
  const [materialTextureSlot, setMaterialTextureSlot] = useState("map");
  const [lightingConfig, setLightingConfig] = useState(() => ({ ...DEFAULT_LIGHTING }));
  const [customEnvironmentFile, setCustomEnvironmentFile] = useState(null);
  const [performanceInfo, setPerformanceInfo] = useState({ fps: 0, quality: "auto", calls: 0, triangles: 0, geometries: 0, textures: 0, estimatedGpuBytes: 0 });
  const [qualityMode, setQualityMode] = useState("auto");
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [exportConfig, setExportConfig] = useState(() => ({ ...DEFAULT_EXPORT }));
  const [savedCameras, setSavedCameras] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("multiview-v8-saved-cameras") || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
    } catch { return []; }
  });
  const [projectName, setProjectName] = useState("Untitled Camera Studio");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [savedProjects, setSavedProjects] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("multiview-v8-projects") || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch {
      return [];
    }
  });
  const [recentImports, setRecentImports] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("multiview-recent-3d-imports") || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState(["front45", "side90", "top45"]);
  const [background, setBackground] = useState("white");
  const [size, setSize] = useState("1024x1024");
  const [customPrompt, setCustomPrompt] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [imageInputMethod, setImageInputMethod] = useState("");
  const [runSize, setRunSize] = useState("1024x1024");
  const [copiedKey, setCopiedKey] = useState("");
  const [camera, setCamera] = useState({ azimuth: 35, elevation: 25, distance: 38 });
  const [currentViewKey, setCurrentViewKey] = useState("top45");
  const [lensPreset, setLensPreset] = useState("85mm");
  const [focusPoint, setFocusPoint] = useState("center");
  const [focusPosition, setFocusPosition] = useState({ x: 50, y: 49 });
  const [orbitInertia, setOrbitInertia] = useState(true);
  const [orbitSnap, setOrbitSnap] = useState(false);
  const [orbitSensitivity, setOrbitSensitivity] = useState("normal");
  const [orbitAuto, setOrbitAuto] = useState(false);
  const [orbitAutoSpeed, setOrbitAutoSpeed] = useState(24);
  const [orbiting, setOrbiting] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("camera");

  const cameraSummary = useMemo(() => describeCamera(camera), [camera]);
  const nearestPreset = useMemo(() => nearestPresetFromCamera(camera), [camera]);
  const orbitSensitivityFactor = orbitSensitivity === "precision" ? 0.32 : orbitSensitivity === "fast" ? 1.15 : 0.68;
  const filteredSceneGraph = useMemo(() => filterSceneTree(sceneGraph, outlinerSearch), [sceneGraph, outlinerSearch]);
  const sceneNodeCount = useMemo(() => countSceneNodes(sceneGraph), [sceneGraph]);
  const filteredSceneNodeCount = useMemo(() => countSceneNodes(filteredSceneGraph), [filteredSceneGraph]);
  const activeMaterial = useMemo(() => materialInfo.materials.find((item) => item.id === activeMaterialId) || materialInfo.materials[0] || null, [materialInfo, activeMaterialId]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    try {
      localStorage.setItem("multiview-v8-projects", JSON.stringify(savedProjects.slice(0, 12)));
    } catch {
      // Local storage can be unavailable in private/restricted browser modes.
    }
  }, [savedProjects]);

  useEffect(() => {
    try {
      localStorage.setItem("multiview-recent-3d-imports", JSON.stringify(recentImports.slice(0, 6)));
    } catch {
      // Local storage can be unavailable in private/restricted browser modes.
    }
  }, [recentImports]);

  useEffect(() => {
    try {
      localStorage.setItem("multiview-v8-saved-cameras", JSON.stringify(savedCameras.slice(0, 20)));
    } catch {
      // Local storage can be unavailable in private/restricted browser modes.
    }
  }, [savedCameras]);

  useEffect(() => {
    if (!materialInfo.materials.length) {
      setActiveMaterialId("");
      return;
    }
    if (!materialInfo.materials.some((item) => item.id === activeMaterialId)) {
      setActiveMaterialId(materialInfo.materials[0].id);
    }
  }, [materialInfo, activeMaterialId]);

  useEffect(() => {
    return () => {
      if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current);
      if (autoOrbitFrameRef.current) cancelAnimationFrame(autoOrbitFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const stopTransientInteraction = () => {
      orbitDragRef.current = null;
      dragDepthRef.current = 0;
      setOrbiting(false);
      setDragging(false);
      stopOrbitInertia();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopTransientInteraction();
        stopAutoOrbit();
      }
    };

    window.addEventListener("blur", stopTransientInteraction);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", stopTransientInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!orbitAuto || angleMode !== "3d" || busy) {
      if (autoOrbitFrameRef.current) {
        cancelAnimationFrame(autoOrbitFrameRef.current);
        autoOrbitFrameRef.current = null;
      }
      return undefined;
    }

    let lastTime = performance.now();
    const tick = (now) => {
      const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      setCamera((current) => ({
        ...current,
        azimuth: normalizeAzimuth(current.azimuth + orbitAutoSpeed * deltaSeconds),
      }));
      autoOrbitFrameRef.current = requestAnimationFrame(tick);
    };

    autoOrbitFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoOrbitFrameRef.current) cancelAnimationFrame(autoOrbitFrameRef.current);
      autoOrbitFrameRef.current = null;
    };
  }, [orbitAuto, orbitAutoSpeed, angleMode, busy]);

  useEffect(() => {
    function handleClipboardPaste(event) {
      if (busy) return;
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      );
      if (isEditable) return;

      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.kind === "file" && ["image/png", "image/jpeg", "image/webp"].includes(item.type));
      if (!imageItem) return;

      const pasted = imageItem.getAsFile();
      if (!pasted) return;
      event.preventDefault();
      chooseFile(clipboardFileFromBlob(pasted), "clipboard");
    }

    window.addEventListener("paste", handleClipboardPaste);
    return () => window.removeEventListener("paste", handleClipboardPaste);
  }, [busy]);

  useEffect(() => {
    if (results.length) resetRunState();
  }, [camera, lensPreset, focusPoint, focusPosition, currentViewKey, background, size, customPrompt, angleMode, selected, viewportProjection, modelTransform]);

  function resetRunState() {
    setResults([]);
    setError("");
    setCopiedKey("");
  }


  function openFilePicker() {
    if (busy || !inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  function chooseFiles(nextFiles, inputMethod = "file") {
    if (busy) return false;
    const files = Array.from(nextFiles || []).filter(Boolean);
    if (!files.length) return false;

    const modelMain = selectPrimaryModel(files);
    const imageMain = files.find((item) => ["image/png", "image/jpeg", "image/webp"].includes(item.type));

    if (modelMain) {
      const totalBytes = files.reduce((sum, item) => sum + (item.size || 0), 0);
      if (totalBytes > MAX_MODEL_BUNDLE_BYTES) {
        setError("3D model bundle must be 500 MB or smaller.");
        return false;
      }
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      setFile(modelMain);
      setFileBundle(files);
      setAssetType("model");
      setModelInfo(null);
      setModelLoadState({ status: "loading", progress: 0, label: "Queued" });
      setSelectedModelObject(null);
      setSelectedSceneIds([]);
      setSceneGraph(null);
      setCollapsedSceneIds(new Set());
      setMaterialInfo({ selectedIds: [], materials: [] });
      setActiveMaterialId("");
      setModelTransform(cloneDefaultModelTransform());
      setModelTransformResetSignal((value) => value + 1);
      setImageInputMethod(inputMethod);
      setRecentImports((current) => {
        const entry = {
          id: `${modelMain.name}-${modelMain.size}-${Date.now()}`,
          name: modelMain.name,
          format: extensionFromName(modelMain.name).toUpperCase(),
          size: totalBytes,
          files: files.length,
          importedAt: Date.now(),
        };
        return [entry, ...current.filter((item) => !(item.name === entry.name && item.size === entry.size))].slice(0, 6);
      });
      setDragging(false);
      dragDepthRef.current = 0;
      setAngleMode("3d");
      resetRunState();
      return true;
    }

    if (imageMain) {
      if (imageMain.size > MAX_IMAGE_BYTES) {
        setError("Image must be 20 MB or smaller.");
        return false;
      }
      if (preview) URL.revokeObjectURL(preview);
      setFile(imageMain);
      setFileBundle([imageMain]);
      setAssetType("image");
      setModelInfo(null);
      setModelLoadState({ status: "idle", progress: 0, label: "" });
      setSelectedModelObject(null);
      setSelectedSceneIds([]);
      setSceneGraph(null);
      setCollapsedSceneIds(new Set());
      setMaterialInfo({ selectedIds: [], materials: [] });
      setActiveMaterialId("");
      setModelTransform(cloneDefaultModelTransform());
      setPreview(URL.createObjectURL(imageMain));
      setImageInputMethod(inputMethod);
      setDragging(false);
      dragDepthRef.current = 0;
      resetRunState();
      return true;
    }

    setError("Use PNG/JPG/WEBP or a supported 3D model: OBJ, STL, PLY, GLB, glTF, FBX, DAE, 3MF, or 3DS.");
    return false;
  }

  function switchPrimaryModel(nextFile) {
    if (busy || !nextFile || nextFile === file) return;
    setFile(nextFile);
    setModelInfo(null);
    setModelLoadState({ status: "loading", progress: 0, label: `Switching to ${nextFile.name}` });
    setSelectedModelObject(null);
    resetRunState();
  }

  function chooseFile(next, inputMethod = "file") {
    return chooseFiles(next ? [next] : [], inputMethod);
  }

  function clipboardFileFromBlob(blob) {
    const extension = fileExtension(blob?.type || "image/png");
    return new File(
      [blob],
      `pasted-image-${Date.now()}.${extension}`,
      { type: blob?.type || "image/png", lastModified: Date.now() },
    );
  }

  async function pasteImageFromClipboard() {
    if (busy) return;

    if (!navigator.clipboard?.read) {
      setError("Clipboard image access is not available here. Press Ctrl+V or Cmd+V after copying an image.");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => ["image/png", "image/jpeg", "image/webp"].includes(type));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        chooseFile(clipboardFileFromBlob(blob), "clipboard");
        return;
      }
      setError("No PNG, JPG, or WEBP image was found in your clipboard.");
    } catch {
      setError("Clipboard access was blocked. Copy an image, then press Ctrl+V or Cmd+V inside the app.");
    }
  }

  function handleSourceDragEnter(event) {
    event.preventDefault();
    if (busy || !event.dataTransfer?.types?.includes("Files")) return;
    dragDepthRef.current += 1;
    setDragging(true);
  }

  function handleSourceDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function handleSourceDragLeave(event) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }

  function handleSourceDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (busy) return;

    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (!droppedFiles.length) return;
    chooseFiles(droppedFiles, "drag-drop");
  }

  function removeFile() {
    if (busy) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setFileBundle([]);
    setAssetType("image");
    setPreview("");
    setModelInfo(null);
    setModelLoadState({ status: "idle", progress: 0, label: "" });
    setSelectedModelObject(null);
    setSelectedSceneIds([]);
    setSceneGraph(null);
    setCollapsedSceneIds(new Set());
    setMaterialInfo({ selectedIds: [], materials: [] });
    setActiveMaterialId("");
    setModelTransform(cloneDefaultModelTransform());
    setModelTransformResetSignal((value) => value + 1);
    setImageInputMethod("");
    setDragging(false);
    dragDepthRef.current = 0;
    resetRunState();
    if (inputRef.current) inputRef.current.value = "";
  }

  function toggleAngle(key) {
    if (busy || angleMode !== "preset") return;
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key],
    );
    setError("");
  }

  function handleWheelDistance(event) {
    if (busy) return;
    event.preventDefault();
    const precision = event.shiftKey ? 0.35 : 1;
    const delta = clamp(event.deltaY * 0.025 * precision, -8, 8);
    updateCameraManual((current) => ({
      ...current,
      distance: current.distance + delta,
    }));
  }

  function stopOrbitInertia() {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }

  function snapCurrentCamera() {
    setCamera((current) => ({
      ...current,
      azimuth: snapAngle(current.azimuth, 15),
      elevation: clamp(Math.round(current.elevation / 5) * 5, -60, 85),
    }));
  }

  function startOrbitInertia(velocityAzimuth, velocityElevation) {
    stopOrbitInertia();
    let vAz = velocityAzimuth;
    let vEl = velocityElevation;
    let lastTime = performance.now();

    const tick = (now) => {
      const dt = Math.min(32, Math.max(1, now - lastTime));
      lastTime = now;
      const frameScale = dt / 16.667;

      setCamera((current) => ({
        ...current,
        azimuth: normalizeAzimuth(current.azimuth + vAz * frameScale),
        elevation: clamp(current.elevation + vEl * frameScale, -60, 85),
      }));

      const decay = Math.pow(0.9, frameScale);
      vAz *= decay;
      vEl *= decay;

      if (Math.abs(vAz) < 0.025 && Math.abs(vEl) < 0.025) {
        inertiaFrameRef.current = null;
        if (orbitSnap) snapCurrentCamera();
        return;
      }
      inertiaFrameRef.current = requestAnimationFrame(tick);
    };

    inertiaFrameRef.current = requestAnimationFrame(tick);
  }

  function stopAutoOrbit() {
    setOrbitAuto(false);
    if (autoOrbitFrameRef.current) {
      cancelAnimationFrame(autoOrbitFrameRef.current);
      autoOrbitFrameRef.current = null;
    }
  }

  function cancelActiveOrbitDrag() {
    orbitDragRef.current = null;
    setOrbiting(false);
  }

  function takeManualCameraControl() {
    stopAutoOrbit();
    stopOrbitInertia();
    cancelActiveOrbitDrag();
  }

  function updateCameraManual(updater) {
    if (busy) return;
    takeManualCameraControl();
    setCamera((current) => {
      const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return {
        azimuth: normalizeAzimuth(numberOr(next.azimuth, current.azimuth)),
        elevation: clamp(numberOr(next.elevation, current.elevation), -60, 85),
        distance: clamp(numberOr(next.distance, current.distance), 0, 100),
      };
    });
    setError("");
  }

  function changeAngleMode(nextMode) {
    if (busy || nextMode === angleMode) return;
    takeManualCameraControl();
    setAngleMode(nextMode);
    setError("");
  }

  function toggleOrbitInertiaSetting() {
    stopOrbitInertia();
    setOrbitInertia((current) => !current);
  }

  function toggleOrbitSnapSetting() {
    stopOrbitInertia();
    setOrbitSnap((current) => !current);
  }

  function startStageOrbit(event) {
    if (busy || event.button !== 0) return;
    event.preventDefault();
    cameraStageRef.current?.focus?.({ preventScroll: true });
    stopAutoOrbit();
    stopOrbitInertia();
    setOrbiting(true);

    const now = performance.now();
    orbitDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: now,
      velocityAzimuth: 0,
      velocityElevation: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveStageOrbit(event) {
    const drag = orbitDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    const totalDx = event.clientX - drag.startX;
    const totalDy = event.clientY - drag.startY;
    const dt = Math.max(1, now - drag.lastTime);
    const precisionMultiplier = event.shiftKey ? 0.35 : 1;
    const sensitivity = orbitSensitivityFactor * precisionMultiplier;
    const azimuthDelta = dx * sensitivity;
    const elevationDelta = -dy * sensitivity * 0.68;

    if (Math.abs(totalDx) > 3 || Math.abs(totalDy) > 3) drag.moved = true;

    setCamera((current) => ({
      ...current,
      azimuth: normalizeAzimuth(current.azimuth + azimuthDelta),
      elevation: clamp(current.elevation + elevationDelta, -60, 85),
    }));

    const frameFactor = 16.667 / dt;
    drag.velocityAzimuth = clamp(azimuthDelta * frameFactor, -18, 18);
    drag.velocityElevation = clamp(elevationDelta * frameFactor, -12, 12);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = now;
  }

  function endStageOrbit(event) {
    const drag = orbitDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOrbiting(false);

    const releaseDelay = Math.max(0, performance.now() - drag.lastTime);
    const velocityAzimuth = releaseDelay > 90 ? 0 : drag.velocityAzimuth;
    const velocityElevation = releaseDelay > 90 ? 0 : drag.velocityElevation;

    if (!drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width && rect.height) {
        const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 8, 92);
        const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 92);
        setFocusPoint("custom");
        setFocusPosition({ x, y });
      }
    } else if (orbitInertia && (Math.abs(velocityAzimuth) > 0.08 || Math.abs(velocityElevation) > 0.08)) {
      startOrbitInertia(velocityAzimuth, velocityElevation);
    } else if (orbitSnap) {
      snapCurrentCamera();
    }

    orbitDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer may already be released by the browser.
    }
  }

  function cancelStageOrbit(event) {
    const drag = orbitDragRef.current;
    if (drag && event?.pointerId != null && drag.pointerId !== event.pointerId) return;
    orbitDragRef.current = null;
    setOrbiting(false);
    try {
      if (event?.pointerId != null) event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been lost.
    }
  }

  function isInteractiveViewportTarget(target) {
    return target instanceof Element && Boolean(
      target.closest("button, input, select, textarea, a, [contenteditable=\"true\"]")
    );
  }

  function toggleAutoOrbit() {
    if (busy || angleMode !== "3d") return;
    stopOrbitInertia();
    cancelActiveOrbitDrag();
    setOrbitAuto((current) => !current);
    setError("");
  }

  function handleStageDoubleClick(event) {
    if (event.target !== event.currentTarget && isInteractiveViewportTarget(event.target)) return;
    event.preventDefault();
    resetCameraControl();
  }

  function handleStageKeyDown(event) {
    if (busy || event.target !== event.currentTarget) return;
    const fine = event.shiftKey;
    const orbitStep = fine ? 1 : (orbitSnap ? 15 : 5);
    const elevationStep = fine ? 1 : 5;
    const distanceStep = fine ? 1 : 4;
    let handled = true;

    if (event.key === "ArrowLeft") adjustAzimuth(-orbitStep);
    else if (event.key === "ArrowRight") adjustAzimuth(orbitStep);
    else if (event.key === "ArrowUp") adjustElevation(elevationStep);
    else if (event.key === "ArrowDown") adjustElevation(-elevationStep);
    else if (event.key === "+" || event.key === "=") adjustDistance(-distanceStep);
    else if (event.key === "-" || event.key === "_") adjustDistance(distanceStep);
    else if (event.key === " ") toggleAutoOrbit();
    else if (event.key === "Home") resetCameraControl();
    else handled = false;

    if (handled) event.preventDefault();
  }

  function setFocusPreset(key) {
    if (busy) return;
    setFocusPoint(key);
    setFocusPosition(focusPresetPosition(key));
    setError("");
  }

  function resetCameraControl() {
    stopAutoOrbit();
    stopOrbitInertia();
    cancelActiveOrbitDrag();
    setCamera({ azimuth: 35, elevation: 25, distance: 38 });
    setLensPreset("85mm");
    setFocusPoint("center");
    setFocusPosition(focusPresetPosition("center"));
    setError("");
  }

  function applyCameraPreset(azimuth, elevation, distance = camera.distance, nextLens = null, nextFocus = null) {
    if (busy) return;
    takeManualCameraControl();
    setCamera({ azimuth: normalizeAzimuth(azimuth), elevation: clamp(elevation, -60, 85), distance: clamp(distance, 0, 100) });
    if (nextLens) setLensPreset(nextLens);
    if (nextFocus) setFocusPreset(nextFocus);
    setError("");
  }

  function useCameraSetup() {
    takeManualCameraControl();
    setAngleMode("3d");
    setWorkspaceTab("prompt");
    resetRunState();
    window.requestAnimationFrame(() => {
      document.querySelector(".settingsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function adjustAzimuth(delta) {
    updateCameraManual((current) => ({ ...current, azimuth: current.azimuth + delta }));
  }

  function adjustElevation(delta) {
    updateCameraManual((current) => ({ ...current, elevation: current.elevation + delta }));
  }

  function adjustDistance(delta) {
    updateCameraManual((current) => ({ ...current, distance: current.distance + delta }));
  }

  function scrollToPanel(selector) {
    window.requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openLayoutWorkspace() {
    setWorkspaceTab("layout");
    scrollToPanel(".sourcePanel");
  }

  function openCameraWorkspace() {
    setWorkspaceTab("camera");
    scrollToPanel(".anglePanel");
  }

  function openPromptWorkspace() {
    setWorkspaceTab("prompt");
    scrollToPanel(".settingsPanel");
  }

  function openStudioWorkspace(tab, selector) {
    setWorkspaceTab(tab);
    if (assetType === "model") setAngleMode("3d");
    window.requestAnimationFrame(() => {
      const element = document.querySelector(selector);
      if (element instanceof HTMLDetailsElement) element.open = true;
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handleModelCameraChange(nextCamera) {
    if (!nextCamera) return;
    stopAutoOrbit();
    stopOrbitInertia();
    setOrbiting(false);
    setCamera((current) => ({
      ...current,
      azimuth: normalizeAzimuth(Number(nextCamera.azimuth ?? current.azimuth)),
      elevation: clamp(Number(nextCamera.elevation ?? current.elevation), -89, 89),
      distance: clamp(Number(nextCamera.distance ?? current.distance), 0, 100),
    }));
  }

  function clearRecentImports() {
    setRecentImports([]);
  }

  function resetModelTransform() {
    setModelTransform(cloneDefaultModelTransform());
    setModelTransformResetSignal((value) => value + 1);
    resetRunState();
  }

  function updateModelTransform(group, axis, rawValue) {
    if (busy || assetType !== "model") return;
    const fallback = group === "scale" ? 1 : 0;
    const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : fallback;
    setModelTransform((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [axis]: group === "scale" ? Math.max(0.001, value) : value,
      },
    }));
    resetRunState();
  }

  function setUniformModelScale(rawValue) {
    const value = Math.max(0.001, Number.isFinite(Number(rawValue)) ? Number(rawValue) : 1);
    setModelTransform((current) => ({
      ...current,
      scale: { x: value, y: value, z: value },
    }));
    resetRunState();
  }

  function toggleSceneCollapsed(id) {
    if (!id) return;
    setCollapsedSceneIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSceneSelection(items) {
    const list = Array.isArray(items) ? items : items ? [items] : [];
    const ids = list.map((item) => item.id || item.uuid).filter(Boolean);
    setSelectedSceneIds((current) => current.length === ids.length && current.every((value, index) => value === ids[index]) ? current : ids);
    setSelectedModelObject(list[0] || null);
  }

  function selectOutlinerObject(id, additive = false) {
    if (!id || ["scene-root", "camera-node", "lights-node"].includes(id)) return;
    const selection = threeViewportRef.current?.selectObjects?.([id], additive) || [];
    handleSceneSelection(selection);
  }

  function renameOutlinerObject(id, currentName = "Object") {
    const next = window.prompt("Rename object", currentName);
    if (!next?.trim()) return;
    threeViewportRef.current?.renameObject?.(id, next.trim());
  }

  function toggleOutlinerVisibility(node) {
    threeViewportRef.current?.setObjectVisibility?.(node.id, !node.visible);
  }

  function toggleOutlinerLock(node) {
    threeViewportRef.current?.setObjectLocked?.(node.id, !node.locked);
  }

  function duplicateSelectedObjects() {
    if (!selectedSceneIds.length) return;
    const ids = threeViewportRef.current?.duplicateObjects?.(selectedSceneIds) || [];
    if (ids.length) setSelectedSceneIds(ids);
  }

  function deleteSelectedObjects() {
    if (!selectedSceneIds.length) return;
    if (!window.confirm(`Delete ${selectedSceneIds.length} selected object${selectedSceneIds.length === 1 ? "" : "s"}?`)) return;
    threeViewportRef.current?.deleteObjects?.(selectedSceneIds);
    setSelectedSceneIds([]);
    setSelectedModelObject(null);
  }

  function isolateSelectedObjects() {
    if (!selectedSceneIds.length) return;
    threeViewportRef.current?.isolateObjects?.(selectedSceneIds);
  }

  function frameSelectedObjects() {
    if (!selectedSceneIds.length) return;
    threeViewportRef.current?.frameSelection?.(selectedSceneIds);
  }

  function updateActiveMaterial(patch) {
    if (!activeMaterialId) return;
    threeViewportRef.current?.updateMaterial?.(activeMaterialId, patch);
  }

  function requestMaterialTexture(slot = "map") {
    if (!activeMaterialId || !materialTextureInputRef.current) return;
    setMaterialTextureSlot(slot);
    materialTextureInputRef.current.value = "";
    materialTextureInputRef.current.click();
  }

  async function handleMaterialTextureFile(fileToApply) {
    if (!fileToApply || !activeMaterialId) return;
    try {
      const changed = await threeViewportRef.current?.setMaterialTexture?.(activeMaterialId, fileToApply, materialTextureSlot || "map");
      if (!changed) throw new Error(`The selected material does not support ${materialTextureSlot || "map"}.`);
      setError("");
    } catch (textureError) {
      setError(`Texture could not be applied: ${textureError?.message || "unknown error"}`);
    }
  }

  function openRelinkFilesPicker() {
    if (!relinkFilesInputRef.current || assetType !== "model") return;
    relinkFilesInputRef.current.value = "";
    relinkFilesInputRef.current.click();
  }

  function mergeRelinkFiles(extraFiles) {
    if (assetType !== "model") return;
    const incoming = Array.from(extraFiles || []).filter(Boolean);
    if (!incoming.length) return;
    const mergedMap = new Map();
    [...fileBundle, ...incoming].forEach((item) => {
      const key = String(item.webkitRelativePath || item.name || "").replace(/\\/g, "/").toLowerCase();
      if (key) mergedMap.set(key, item);
    });
    chooseFiles(Array.from(mergedMap.values()), "relink");
  }

  async function handleMaterialTextureDrop(event, slot = "map") {
    event.preventDefault();
    if (!activeMaterialId) return;
    const dropped = Array.from(event.dataTransfer?.files || []);
    const texture = dropped.find((item) => ["png", "jpg", "jpeg", "webp", "bmp", "tga", "dds", "ktx2"].includes(extensionFromName(item.name)));
    if (!texture) {
      setError("Drop a PNG/JPG/WEBP/BMP/TGA/DDS/KTX2 texture file.");
      return;
    }
    setMaterialTextureSlot(slot);
    try {
      const changed = await threeViewportRef.current?.setMaterialTexture?.(activeMaterialId, texture, slot);
      if (!changed) throw new Error(`The selected material does not support ${slot}.`);
      setError("");
    } catch (textureError) {
      setError(`Texture could not be applied: ${textureError?.message || "unknown error"}`);
    }
  }

  function updateLighting(patch) {
    setLightingConfig((current) => ({ ...current, ...patch }));
  }

  function applyLightingPreset(key) {
    if (key === "custom") {
      openEnvironmentPicker();
      return;
    }
    const recipe = LIGHTING_RECIPES[key];
    if (recipe) setLightingConfig((current) => ({ ...current, ...recipe }));
  }

  function openEnvironmentPicker() {
    if (!environmentInputRef.current) return;
    environmentInputRef.current.value = "";
    environmentInputRef.current.click();
  }

  function chooseEnvironmentFile(fileToUse) {
    if (!fileToUse) return;
    const ext = extensionFromName(fileToUse.name);
    if (!["hdr", "exr"].includes(ext)) {
      setError("Custom lighting environment must be an .hdr or .exr file.");
      return;
    }
    setCustomEnvironmentFile(fileToUse);
    updateLighting({ preset: "custom" });
    setError("");
  }

  function saveCurrentCamera() {
    const snapshot = {
      id: `camera-${Date.now()}`,
      name: `Camera ${savedCameras.length + 1}`,
      savedAt: new Date().toISOString(),
      camera: { ...camera },
      lensPreset,
      projection: viewportProjection,
      focusPoint,
      focusPosition: { ...focusPosition },
    };
    setSavedCameras((current) => [snapshot, ...current].slice(0, 20));
  }

  function applySavedCamera(saved) {
    if (!saved?.camera) return;
    takeManualCameraControl();
    setCamera({
      azimuth: normalizeAzimuth(numberOr(saved.camera.azimuth, 35)),
      elevation: clamp(numberOr(saved.camera.elevation, 25), -89, 89),
      distance: clamp(numberOr(saved.camera.distance, 38), 0, 100),
    });
    if (saved.lensPreset) setLensPreset(saved.lensPreset);
    if (saved.projection) setViewportProjection(saved.projection === "orthographic" ? "orthographic" : "perspective");
    if (saved.focusPoint) setFocusPoint(saved.focusPoint);
    if (saved.focusPosition) setFocusPosition({ x: clamp(numberOr(saved.focusPosition.x, 50), 0, 100), y: clamp(numberOr(saved.focusPosition.y, 49), 0, 100) });
  }

  function deleteSavedCamera(id) {
    setSavedCameras((current) => current.filter((item) => item.id !== id));
  }

  function createProjectSnapshot() {
    const assetFiles = fileBundle.map((item) => ({
      name: item.name,
      size: item.size || 0,
      type: item.type || "",
      lastModified: item.lastModified || 0,
    }));
    return {
      format: "multiview-camera-studio",
      version: "8.9",
      projectName: safeProjectName(projectName),
      savedAt: new Date().toISOString(),
      asset: {
        type: assetType,
        primary: file?.name || "",
        format: file ? extensionFromName(file.name) : "",
        files: assetFiles,
        embedded: false,
      },
      camera: {
        azimuth: camera.azimuth,
        elevation: camera.elevation,
        distance: camera.distance,
        lensPreset,
        projection: viewportProjection,
        focusPoint,
        focusPosition: { ...focusPosition },
      },
      viewport: {
        shading: viewportShading,
        grid: viewportGrid,
        ground: viewportGround,
        qualityMode,
        debugEnabled,
      },
      lighting: { ...lightingConfig, customEnvironmentName: customEnvironmentFile?.name || "" },
      exportSettings: { ...exportConfig },
      savedCameras: savedCameras.slice(0, 20),
      objectTransform: normalizeProjectTransform(modelTransform),
      prompt: {
        angleMode,
        selectedAngles: [...selected],
        currentViewKey,
        background,
        size,
        customPrompt,
        runSize,
        generatedResults: results.slice(0, 20),
      },
      selection: selectedModelObject ? { ...selectedModelObject } : null,
      modelSummary: modelInfo ? {
        format: modelInfo.format,
        meshes: modelInfo.meshes,
        vertices: modelInfo.vertices,
        triangles: modelInfo.triangles,
        materials: modelInfo.materials?.count || 0,
      } : null,
    };
  }

  function applyProjectSnapshot(snapshot, sourceLabel = "project") {
    if (!snapshot || snapshot.format !== "multiview-camera-studio") {
      setError("This is not a valid MultiView Camera Studio project.");
      return false;
    }
    const projectCamera = snapshot.camera || {};
    const viewport = snapshot.viewport || {};
    const prompt = snapshot.prompt || {};
    takeManualCameraControl();
    setProjectName(safeProjectName(snapshot.projectName || "Untitled Camera Studio"));
    setCamera({
      azimuth: normalizeAzimuth(numberOr(projectCamera.azimuth, 35)),
      elevation: clamp(numberOr(projectCamera.elevation, 25), -89, 89),
      distance: clamp(numberOr(projectCamera.distance, 38), 0, 100),
    });
    setLensPreset(LENS_PRESETS.some((item) => item.key === projectCamera.lensPreset) ? projectCamera.lensPreset : "85mm");
    setViewportProjection(projectCamera.projection === "orthographic" ? "orthographic" : "perspective");
    setFocusPoint(["center", "front", "top", "logo", "custom"].includes(projectCamera.focusPoint) ? projectCamera.focusPoint : "center");
    setFocusPosition({
      x: clamp(numberOr(projectCamera.focusPosition?.x, 50), 0, 100),
      y: clamp(numberOr(projectCamera.focusPosition?.y, 49), 0, 100),
    });
    setViewportShading(["material", "solid", "wireframe", "normal"].includes(viewport.shading) ? viewport.shading : "material");
    setViewportGrid(viewport.grid !== false);
    setViewportGround(viewport.ground !== false);
    setQualityMode(["auto", "low", "medium", "high", "ultra"].includes(viewport.qualityMode) ? viewport.qualityMode : "auto");
    setDebugEnabled(Boolean(viewport.debugEnabled));
    setLightingConfig({ ...DEFAULT_LIGHTING, ...(snapshot.lighting || {}) });
    setCustomEnvironmentFile(null);
    setExportConfig({ ...DEFAULT_EXPORT, ...(snapshot.exportSettings || {}) });
    setSavedCameras(Array.isArray(snapshot.savedCameras) ? snapshot.savedCameras.slice(0, 20) : []);
    setModelTransform(normalizeProjectTransform(snapshot.objectTransform));
    setAngleMode(prompt.angleMode === "preset" ? "preset" : "3d");
    setSelected(Array.isArray(prompt.selectedAngles) && prompt.selectedAngles.length ? prompt.selectedAngles.filter((key) => ANGLES.some((item) => item.key === key)) : ["front45"]);
    setCurrentViewKey(ANGLES.some((item) => item.key === prompt.currentViewKey) ? prompt.currentViewKey : "top45");
    setBackground(prompt.background === "original" ? "original" : "white");
    setSize(["1024x1024", "1536x1024", "1024x1536"].includes(prompt.size) ? prompt.size : "1024x1024");
    setCustomPrompt(String(prompt.customPrompt || "").slice(0, 1000));
    setRunSize(["1024x1024", "1536x1024", "1024x1536"].includes(prompt.runSize) ? prompt.runSize : (["1024x1024", "1536x1024", "1024x1536"].includes(prompt.size) ? prompt.size : "1024x1024"));
    setResults(Array.isArray(prompt.generatedResults) ? prompt.generatedResults.slice(0, 20) : []);
    setWorkspaceTab(Array.isArray(prompt.generatedResults) && prompt.generatedResults.length ? "prompt" : "camera");
    setLastSavedAt(snapshot.savedAt || new Date().toISOString());

    const requiredNames = (snapshot.asset?.files || []).map((item) => item.name).filter(Boolean);
    const loadedNames = new Set(fileBundle.map((item) => item.name));
    const missingAsset = requiredNames.length > 0 && requiredNames.some((name) => !loadedNames.has(name));
    if (missingAsset) {
      setError(`${sourceLabel} loaded. Camera/project settings were restored, but the original asset files are not embedded. Re-import: ${requiredNames.slice(0, 4).join(", ")}${requiredNames.length > 4 ? "…" : ""}`);
    } else {
      setError("");
    }
    return true;
  }

  function saveProjectLocally() {
    const snapshot = createProjectSnapshot();
    const id = `${safeProjectName(projectName).toLowerCase()}-${Date.now()}`;
    const entry = {
      id,
      name: safeProjectName(projectName),
      savedAt: snapshot.savedAt,
      assetName: snapshot.asset.primary || "No asset",
      assetType: snapshot.asset.type,
      snapshot,
    };
    setSavedProjects((current) => [entry, ...current.filter((item) => item.name !== entry.name)].slice(0, 12));
    setLastSavedAt(snapshot.savedAt);
    setError("");
  }

  function deleteSavedProject(id) {
    setSavedProjects((current) => current.filter((item) => item.id !== id));
  }

  function exportMultiviewProject() {
    const snapshot = createProjectSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, projectFileName(projectName, "multiview"));
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setLastSavedAt(snapshot.savedAt);
  }

  function openProjectPicker() {
    if (!projectFileInputRef.current) return;
    projectFileInputRef.current.value = "";
    projectFileInputRef.current.click();
  }

  async function importMultiviewProject(fileToOpen) {
    if (!fileToOpen) return;
    try {
      const snapshot = JSON.parse(await fileToOpen.text());
      if (applyProjectSnapshot(snapshot, `.multiview project`)) {
        setProjectName(safeProjectName(snapshot.projectName || fileToOpen.name.replace(/\.multiview$/i, "")));
      }
    } catch (projectError) {
      setError(`Could not open project: ${projectError?.message || "invalid .multiview file"}`);
    }
  }

  function exportCameraJson() {
    const targetSpec = getTargetCameraSpec({
      targetKey: angleMode === "3d" ? "custom3d" : (selected[0] || "front45"),
      camera,
      cameraSummary,
      lensPreset,
      focusPoint,
      focusPosition,
      size,
      projectionMode: assetType === "model" ? viewportProjection : "perspective",
    });
    const payload = {
      format: "multiview-camera-json",
      version: "8.9",
      projectName: safeProjectName(projectName),
      exportedAt: new Date().toISOString(),
      targetCamera: targetSpec,
      rawCamera: {
        azimuth: camera.azimuth,
        elevation: camera.elevation,
        distance: camera.distance,
        lensPreset,
        projection: assetType === "model" ? viewportProjection : "perspective",
        focusPoint,
        focusPosition,
      },
      objectTransform: assetType === "model" ? normalizeProjectTransform(modelTransform) : null,
      viewport: assetType === "model" ? { shading: viewportShading, grid: viewportGrid, ground: viewportGround } : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, projectFileName(projectName, "camera.json"));
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportViewportScreenshot(overrides = {}) {
    if (assetType !== "model" || modelLoadState.status !== "ready") {
      setError("Load a ready 3D model before exporting a viewport screenshot.");
      return;
    }
    try {
      const config = { ...exportConfig, ...overrides };
      const format = ["png", "jpeg", "webp"].includes(config.format) ? config.format : "png";
      const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
      const isCustom = config.scale === "custom";
      const blob = await threeViewportRef.current?.captureScreenshot?.({
        mimeType,
        quality: Number(config.quality) || 0.94,
        transparent: Boolean(config.transparent && format === "png"),
        scale: isCustom ? 1 : Number(config.scale) || 1,
        width: isCustom ? Math.max(64, Math.min(8192, Number(config.customWidth) || 1920)) : undefined,
        height: isCustom ? Math.max(64, Math.min(8192, Number(config.customHeight) || 1080)) : undefined,
      });
      if (!blob) throw new Error("Viewport capture returned no image.");
      const url = URL.createObjectURL(blob);
      triggerDownload(url, projectFileName(projectName, `viewport.${format === "jpeg" ? "jpg" : format}`));
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setError("");
    } catch (captureError) {
      setError(`Screenshot failed: ${captureError?.message || "unknown error"}`);
    }
  }

  function downloadJson(payload, suffix) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, projectFileName(projectName, suffix));
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportSceneJson() {
    downloadJson({
      format: "multiview-scene-json",
      version: "8.9",
      projectName: safeProjectName(projectName),
      exportedAt: new Date().toISOString(),
      scene: threeViewportRef.current?.getSceneSnapshot?.() || sceneGraph,
      modelInfo,
      lighting: lightingConfig,
      viewport: { projection: viewportProjection, shading: viewportShading, grid: viewportGrid, ground: viewportGround, qualityMode },
    }, "scene.json");
  }

  function exportTransformJson() {
    downloadJson({
      format: "multiview-transform-json",
      version: "8.9",
      projectName: safeProjectName(projectName),
      exportedAt: new Date().toISOString(),
      modelTransform: normalizeProjectTransform(modelTransform),
      selectedObjects: selectedSceneIds,
    }, "transform.json");
  }

  function exportPromptTxt() {
    const promptText = results.length
      ? results.map((result, index) => `# Camera Prompt ${index + 1}\n\n${result.prompt}`).join("\n\n------------------------------\n\n")
      : buildLocalPrompt({
          currentViewKey,
          targetKey: angleMode === "3d" ? "custom3d" : (selected[0] || "front45"),
          camera,
          cameraSummary,
          background,
          size,
          customPrompt,
          lensPreset,
          focusPoint,
          focusPosition,
          assetType,
          modelFormat,
          projectionMode: assetType === "model" ? viewportProjection : "perspective",
          modelTransform,
        });
    const blob = new Blob([promptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, projectFileName(projectName, "prompt.txt"));
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function copyCameraConfiguration() {
    const targetSpec = getTargetCameraSpec({
      targetKey: angleMode === "3d" ? "custom3d" : (selected[0] || "front45"),
      camera,
      cameraSummary,
      lensPreset,
      focusPoint,
      focusPosition,
      size,
      projectionMode: assetType === "model" ? viewportProjection : "perspective",
    });
    const text = [
      "Target camera:",
      `View: ${targetSpec.view}`,
      `Azimuth: ${targetSpec.azimuth}°`,
      `Elevation: ${targetSpec.elevation}°`,
      `Distance: ${targetSpec.distance}`,
      `Lens / FOV: ${targetSpec.lens}`,
      `Projection: ${targetSpec.projection}`,
      `Focus target: ${targetSpec.focus}`,
      `Framing: ${targetSpec.framing}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setError("");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  async function batchExportSavedCameras() {
    if (assetType !== "model" || modelLoadState.status !== "ready") {
      setError("Load a ready 3D model before batch exporting cameras.");
      return;
    }
    if (!savedCameras.length) {
      setError("Save at least one camera before batch exporting screenshots.");
      return;
    }
    const original = { camera: { ...camera }, lensPreset, viewportProjection, focusPoint, focusPosition: { ...focusPosition } };
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let index = 0; index < savedCameras.length; index += 1) {
        const saved = savedCameras[index];
        applySavedCamera(saved);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => setTimeout(resolve, 60));
        const batchFormat = ["png", "jpeg", "webp"].includes(exportConfig.format) ? exportConfig.format : "png";
        const batchMime = batchFormat === "jpeg" ? "image/jpeg" : batchFormat === "webp" ? "image/webp" : "image/png";
        const custom = exportConfig.scale === "custom";
        const blob = await threeViewportRef.current?.captureScreenshot?.({
          mimeType: batchMime,
          quality: Number(exportConfig.quality) || 0.94,
          transparent: Boolean(exportConfig.transparent && batchFormat === "png"),
          scale: custom ? 1 : Number(exportConfig.scale) || 1,
          width: custom ? Math.max(64, Math.min(8192, Number(exportConfig.customWidth) || 1920)) : undefined,
          height: custom ? Math.max(64, Math.min(8192, Number(exportConfig.customHeight) || 1080)) : undefined,
        });
        const extension = batchFormat === "jpeg" ? "jpg" : batchFormat;
        if (blob) zip.file(`${String(index + 1).padStart(2, "0")}-${safeProjectName(saved.name || `camera-${index + 1}`)}.${extension}`, blob);
      }
      const output = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(output);
      triggerDownload(url, projectFileName(projectName, "camera-batch.zip"));
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setError("");
    } catch (batchError) {
      setError(`Batch export failed: ${batchError?.message || "unknown error"}`);
    } finally {
      setCamera(original.camera);
      setLensPreset(original.lensPreset);
      setViewportProjection(original.viewportProjection);
      setFocusPoint(original.focusPoint);
      setFocusPosition(original.focusPosition);
    }
  }


  function newProject() {
    takeManualCameraControl();
    removeFile();
    setProjectName("Untitled Camera Studio");
    setCamera({ azimuth: 35, elevation: 25, distance: 38 });
    setLensPreset("85mm");
    setFocusPoint("center");
    setFocusPosition({ x: 50, y: 49 });
    setViewportProjection("perspective");
    setViewportShading("material");
    setViewportGrid(true);
    setViewportGround(true);
    setModelTransform(cloneDefaultModelTransform());
    setLightingConfig({ ...DEFAULT_LIGHTING });
    setCustomEnvironmentFile(null);
    setPerformanceInfo({ fps: 0, quality: "auto", calls: 0, triangles: 0, geometries: 0, textures: 0, estimatedGpuBytes: 0 });
    setQualityMode("auto");
    setDebugEnabled(false);
    setExportConfig({ ...DEFAULT_EXPORT });
    setBackground("white");
    setSize("1024x1024");
    setCustomPrompt("");
    setSelected(["front45", "side90", "top45"]);
    setCurrentViewKey("top45");
    setLastSavedAt("");
    setWorkspaceTab("layout");
  }

  function runAction() {
    takeManualCameraControl();
    if (!file) {
      setError("Upload a reference image or 3D model first.");
      return;
    }

    if (assetType === "model" && modelLoadState.status !== "ready") {
      setError(modelLoadState.status === "loading" ? "Wait for the 3D model to finish loading." : "The 3D model must load successfully before building the prompt.");
      return;
    }

    if (angleMode === "preset" && !selected.length) {
      setError("Select at least one target camera angle.");
      return;
    }

    const anglesForRun = angleMode === "preset" ? [...selected] : ["custom3d"];
    const generatedResults = anglesForRun.map((angleKey) => ({
      angleKey,
      cameraLabel: angleKey === "custom3d" ? cameraSummary.short : undefined,
      currentViewKey,
      assetType,
      modelFormat: assetType === "model" ? extensionFromName(file?.name) : "",
      currentViewAnalysis: {
        view: assetType === "model" ? "3D model / free camera" : viewDescription(currentViewKey),
        azimuthDeg: null,
        elevationDeg: null,
        shotDistance: "manual",
        confidence: "manual",
      },
      lensPreset,
      focusPoint,
      focusPosition,
      projectionMode: assetType === "model" ? viewportProjection : "perspective",
      modelTransform: assetType === "model" ? normalizeProjectTransform(modelTransform) : null,
      targetCameraSpec: getTargetCameraSpec({
        targetKey: angleKey,
        camera,
        cameraSummary,
        lensPreset,
        focusPoint,
        focusPosition,
        size,
        projectionMode: assetType === "model" ? viewportProjection : "perspective",
      }),
      targetViewText: targetViewText(
        angleKey,
        camera,
        cameraSummary,
        lensPreset,
        focusPoint,
        focusPosition,
        size,
        assetType === "model" ? viewportProjection : "perspective",
      ),
      prompt: buildLocalPrompt({
        currentViewKey,
        targetKey: angleKey,
        camera,
        cameraSummary,
        background,
        size,
        customPrompt,
        lensPreset,
        focusPoint,
        focusPosition,
        assetType,
        modelFormat: assetType === "model" ? extensionFromName(file?.name) : "",
        projectionMode: assetType === "model" ? viewportProjection : "perspective",
        modelTransform,
      }),
    }));

    setBusy(false);
    setError("");
    setWorkspaceTab("prompt");
    setResults(generatedResults);
    setRunSize(size);
  }

  function triggerDownload(href, name) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function copyPrompt(text, key) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("copy failed");
      }
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? "" : current));
      }, 1600);
    } catch {
      setError("Could not copy the prompt automatically. Select the prompt text and copy it manually.");
    }
  }

  function downloadAllPrompts() {
    const promptResults = results.filter((result) => result.prompt);
    if (!promptResults.length) return;

    const content = promptResults.map((result) => {
      const title = result.angleKey === "custom3d"
        ? `Custom 3D Angle\n${result.cameraLabel || cameraSummary.short}`
        : `# ${ANGLES.find((angle) => angle.key === result.angleKey)?.label || result.angleKey}`;
      return `${title}\n\n${result.prompt}`;
    }).join("\n\n------------------------------\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "multiview-chatgpt-prompts.txt");
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  const readyCount = results.filter((result) => result.base64 || result.prompt).length;
  const currentViewLabel = assetType === "model"
    ? `3D ${extensionFromName(file?.name || "model").toUpperCase()} model`
    : (ANGLES.find((angle) => angle.key === currentViewKey)?.label || "Source");
  const modelFormat = assetType === "model" ? extensionFromName(file?.name || "") : "";
  const availableModelFiles = assetType === "model" ? fileBundle.filter((item) => isSupportedModelFile(item)) : [];
  const totalBundleBytes = fileBundle.reduce((sum, item) => sum + (item.size || 0), 0);
  const activeLens = LENS_PRESETS.find((item) => item.key === lensPreset) || LENS_PRESETS[3];
  const activeRecipeKey = CAMERA_PRESET_CARDS.find((item) =>
    isCameraNearPreset(camera, item) && item.lens === lensPreset && item.focus === focusPoint
  )?.key || "";

  const previewRotateY = camera.azimuth;
  const previewRotateX = clamp(-camera.elevation * 0.82, -70, 58);
  const previewScale = 1.18 - camera.distance * 0.0065;
  const previewTranslateZ = 58 - camera.distance * 0.55;

  function renderSceneNode(node, depth = 0, budget = null) {
    if (!node) return null;
    const renderBudget = budget || { count: 0, limit: outlinerSearch.trim() ? 3000 : 1200 };
    if (renderBudget.count >= renderBudget.limit) return null;
    renderBudget.count += 1;
    const selectedNode = selectedSceneIds.includes(node.id);
    const special = ["scene-root", "camera-node", "lights-node"].includes(node.id);
    const hasChildren = (node.children || []).length > 0;
    const collapsed = !outlinerSearch.trim() && collapsedSceneIds.has(node.id);
    return (
      <div className="outlinerNodeWrap" key={node.id || `${node.name}-${depth}`}>
        <div
          className={`outlinerNode ${selectedNode ? "selected" : ""} ${special ? "special" : ""}`}
          style={{ paddingLeft: `${5 + depth * 13}px` }}
          onClick={(event) => { if (!special) selectOutlinerObject(node.id, event.ctrlKey || event.metaKey); }}
          onDoubleClick={() => { if (!special) renameOutlinerObject(node.id, node.name); }}
        >
          <button
            type="button"
            className={`outlinerDisclosure ${hasChildren ? "hasChildren" : ""}`}
            onClick={(event) => { event.stopPropagation(); if (hasChildren) toggleSceneCollapsed(node.id); }}
            tabIndex={hasChildren ? 0 : -1}
            aria-label={hasChildren ? (collapsed ? "Expand object" : "Collapse object") : undefined}
          >{hasChildren ? (collapsed ? "▸" : "▾") : ""}</button>
          <span className="outlinerTypeIcon">{node.type === "Camera" ? <Camera size={12} /> : node.type === "Lights" ? <Lightbulb size={12} /> : node.type === "Scene" ? <Layers size={12} /> : <Box size={12} />}</span>
          <span className="outlinerNodeName" title={node.name}>{node.name}</span>
          {!special && (
            <span className="outlinerActions">
              <button type="button" title={node.visible ? "Hide" : "Show"} onClick={(event) => { event.stopPropagation(); toggleOutlinerVisibility(node); }}>{node.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button>
              <button type="button" title={node.locked ? "Unlock" : "Lock"} onClick={(event) => { event.stopPropagation(); toggleOutlinerLock(node); }}>{node.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
            </span>
          )}
        </div>
        {!collapsed && (node.children || []).map((child) => renderSceneNode(child, depth + 1, renderBudget))}
      </div>
    );
  }


  return (
    <main className="shell">
      <header className="blenderAppHeader">
        <div className="blenderMenuBar">
          <div className="blenderBrand" aria-label="MultiView Camera">
            <span className="blenderBrandMark"><Aperture size={16} /></span>
            <strong>MultiView Camera</strong>
          </div>
          <nav className="blenderMenus projectMenus" aria-label="Project actions">
            <button type="button" onClick={newProject}>New</button>
            <button type="button" onClick={() => { openLayoutWorkspace(); openFilePicker(); }}>Open asset</button>
            <button type="button" onClick={saveProjectLocally}><Save size={12} /> Save</button>
            <button type="button" onClick={openProjectPicker}><FolderOpen size={12} /> Open project</button>
            <button type="button" onClick={exportMultiviewProject}><Download size={12} /> .multiview</button>
          </nav>
          <div className="blenderAppState"><span className="statusDot" /> Browser-only</div>
        </div>
        <div className="blenderWorkspaceBar">
          <div className="blenderWorkspaceTabs" aria-label="Workspace tabs">
            <button type="button" className={workspaceTab === "layout" ? "active" : ""} onClick={openLayoutWorkspace}>Layout</button>
            <button type="button" className={workspaceTab === "scene" ? "active" : ""} onClick={() => openStudioWorkspace("scene", ".sceneOutlinerPanel")}>Scene</button>
            <button type="button" className={workspaceTab === "camera" ? "active" : ""} onClick={openCameraWorkspace}>Camera</button>
            <button type="button" className={workspaceTab === "material" ? "active" : ""} onClick={() => openStudioWorkspace("material", ".materialStudioSection")}>Material</button>
            <button type="button" className={workspaceTab === "lighting" ? "active" : ""} onClick={() => openStudioWorkspace("lighting", ".lightingStudioSection")}>Lighting</button>
            <button type="button" className={workspaceTab === "export" ? "active" : ""} onClick={() => openStudioWorkspace("export", ".exportStudioSection")}>Export</button>
            <button type="button" className={workspaceTab === "prompt" ? "active" : ""} onClick={openPromptWorkspace}>Prompt</button>
          </div>
          <div className="blenderSceneSelector studioProjectIdentity">
            <span>Project</span>
            <input
              className="projectNameInput"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value.slice(0, 80))}
              aria-label="Project name"
            />
            <span className="blenderVersionBadge">V8.9 PRODUCTION STUDIO</span>
          </div>
        </div>
      </header>

      <input
        ref={projectFileInputRef}
        hidden
        type="file"
        accept=".multiview,application/json"
        onChange={(event) => importMultiviewProject(event.target.files?.[0])}
      />

      <input
        ref={environmentInputRef}
        hidden
        type="file"
        accept=".hdr,.exr"
        onChange={(event) => chooseEnvironmentFile(event.target.files?.[0])}
      />
      <input
        ref={materialTextureInputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp,.tga,.dds,.ktx2"
        onChange={(event) => handleMaterialTextureFile(event.target.files?.[0])}
      />
      <input
        ref={relinkFilesInputRef}
        hidden
        type="file"
        multiple
        accept={FILE_ACCEPT}
        onChange={(event) => mergeRelinkFiles(event.target.files)}
      />

      <div className="blenderInfoBar studioInfoBar">
        <span><Camera size={13} /> Camera Workspace</span>
        <span>{assetType === "model" ? `3D ${modelFormat.toUpperCase()} → Camera` : "Reference → Target"}</span>
        <span>{lensLabel(lensPreset)} Lens</span>
        <span>Focus {focusBadgeText(focusPoint, focusPosition)}</span>
        <span className={orbitAuto ? "active" : ""}>{orbitAuto ? `Auto Orbit ${orbitAutoSpeed}°/s` : "Orbit Ready"}</span>
        {assetType === "model" && <span className="perfInfoChip"><Activity size={11} /> {performanceInfo.fps || 0} FPS · {performanceInfo.quality || qualityMode} · GPU est. {formatBytes(performanceInfo.estimatedGpuBytes || 0)}</span>}
        <div className="studioExportActions">
          {assetType === "model" && <button type="button" className={debugEnabled ? "active" : ""} onClick={() => setDebugEnabled((value) => !value)}><Activity size={12} /> Debug</button>}
          <button type="button" onClick={exportCameraJson}><Download size={12} /> Camera JSON</button>
          <button type="button" onClick={() => exportViewportScreenshot()} disabled={assetType !== "model" || modelLoadState.status !== "ready"}><Camera size={12} /> Screenshot</button>
          {lastSavedAt && <small>Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>}
        </div>
      </div>

      <section className="workspace blenderWorkspace">
        <div
          className={`panel sourcePanel uiReveal ${dragging ? "sourcePanelDragging" : ""}`}
          onDragEnter={handleSourceDragEnter}
          onDragOver={handleSourceDragOver}
          onDragLeave={handleSourceDragLeave}
          onDrop={handleSourceDrop}
        >
          {dragging && (
            <div className="sourceDropOverlay" aria-hidden="true">
              <span><UploadCloud size={24} /></span>
              <strong>{file ? "Drop to replace asset" : "Drop image or 3D model here"}</strong>
              <small>PNG/JPG/WEBP · or OBJ/STL/PLY/GLB/glTF/FBX/DAE/3MF/3DS</small>
            </div>
          )}
          <div className="panelHead blenderEditorHeader">
            <span className="blenderEditorType">ASSET EDITOR</span>
            <div className="panelTitle">
              <span className="step">01</span>
              <div>
                <h2>Reference asset</h2>
                <p>Load an image or a real 3D model. Everything stays local in your browser.</p>
              </div>
            </div>
            {file && (
              <button
                type="button"
                className="iconBtn"
                onClick={removeFile}
                disabled={busy}
                aria-label="Remove source asset"
                title="Remove asset"
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>

          {!file ? (
            <button
              type="button"
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onClick={openFilePicker}
              disabled={busy}
            >
              <span className="uploadIcon"><UploadCloud size={27} /></span>
              <strong>Drop image or 3D model</strong>
              <span>Images can also be pasted with Ctrl+V / Cmd+V. For OBJ/glTF assets, select companion files together.</span>
              <small>OBJ · STL · PLY · GLB · glTF · FBX · DAE · 3MF · 3DS · PNG/JPG/WEBP</small>
            </button>
          ) : assetType === "model" ? (
            <div className="modelSourceCard">
              <div className="modelSourceViewer modelSourcePlaceholder">
                <div className="modelSourcePlaceholderIcon"><Rotate3d size={34} /></div>
                <strong>3D model loaded</strong>
                <span>Open 3D Camera Control to inspect the real geometry.</span>
                <span className="modelFormatBadge">{modelFormat.toUpperCase()}</span>
              </div>
              <div className="modelSourceMeta">
                <div>
                  <strong title={file?.name}>{file?.name}</strong>
                  <span>{formatBytes(totalBundleBytes)} · {fileBundle.length} file{fileBundle.length === 1 ? "" : "s"}</span>
                </div>
                <button type="button" className="replaceBtn" onClick={openFilePicker} disabled={busy}>
                  <ImagePlus size={15} /> Replace
                </button>
              </div>
              {availableModelFiles.length > 1 && (
                <div className="modelFormatSwitcher">
                  <div><strong>Model source</strong><span>Multiple formats detected. OBJ is preferred when a matching MTL is supplied.</span></div>
                  <div className="modelFormatButtons">
                    {availableModelFiles.map((item) => (
                      <button
                        type="button"
                        key={`${item.name}-${item.size}`}
                        className={item === file ? "active" : ""}
                        onClick={() => switchPrimaryModel(item)}
                        disabled={busy || modelLoadState.status === "loading"}
                        title={item.name}
                      >
                        {extensionFromName(item.name).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {modelInfo && (
                <div className="modelStatsBar">
                  <span><b>{modelInfo.meshes}</b> meshes</span>
                  <span><b>{modelInfo.vertices.toLocaleString()}</b> vertices</span>
                  <span><b>{(modelInfo.triangles || 0).toLocaleString()}</b> triangles</span>
                  <span><b>{modelInfo.files}</b> linked files</span>
                </div>
              )}
              {modelInfo?.materials && (
                <div className="materialStatusCard">
                  <div className="materialStatusHead">
                    <strong>Materials</strong>
                    <span className={modelInfo.materials.textured > 0 || modelInfo.materials.hasMaterialLibrary ? "materialOk" : "materialWarn"}>
                      {modelInfo.materials.textured > 0 ? "Textures active" : modelInfo.materials.hasMaterialLibrary ? "MTL active" : "No material library"}
                    </span>
                  </div>
                  <div className="materialStatusMetrics">
                    <span><b>{modelInfo.materials.count || 0}</b> material slots</span>
                    <span><b>{modelInfo.materials.textured || 0}</b> textured</span>
                    <span><b>{modelInfo.materials.uvMeshes || 0}</b> UV meshes</span>
                  </div>
                  {modelInfo.materials.mtlFile && <small>MTL: {modelInfo.materials.mtlFile}</small>}
                  {modelInfo.materials.hasMaterialLibrary && modelInfo.materials.textured === 0 && modelInfo.dependencies?.required?.some((item) => item.kind === "texture") && (
                    <small className="materialWarningText">MTL colors loaded, but texture image files are missing or could not be matched. Select/drop the texture files together with OBJ + MTL.</small>
                  )}
                </div>
              )}
              {totalBundleBytes > 80 * 1024 * 1024 && !modelInfo && (
                <div className="modelWarningList">
                  <strong>Large import</strong>
                  <span>⚠ This bundle is {formatBytes(totalBundleBytes)}. Loading may use substantial browser memory.</span>
                </div>
              )}
              {modelLoadState.status === "loading" && (
                <div className="sourceModelProgress">
                  <div><strong>Importing model</strong><span>{modelLoadState.progress || 0}%</span></div>
                  <div className="sourceModelProgressTrack"><i style={{ width: `${modelLoadState.progress || 0}%` }} /></div>
                  <small>{modelLoadState.label || "Preparing 3D asset…"}</small>
                </div>
              )}
              {["error", "cancelled"].includes(modelLoadState.status) && (
                <div className="modelWarningList">
                  <strong>{modelLoadState.status === "cancelled" ? "Import cancelled" : "Import error"}</strong>
                  <span>{modelLoadState.label || (modelLoadState.status === "cancelled" ? "Select the model again or use Reload in the viewport." : "The model could not be loaded.")}</span>
                </div>
              )}
              {modelInfo?.warnings?.length > 0 && (
                <div className="modelWarningList">
                  <strong>Import warnings</strong>
                  {modelInfo.warnings.map((warning, index) => <span key={`${warning}-${index}`}>⚠ {warning}</span>)}
                </div>
              )}
              {modelInfo?.dependencies && (
                <div className="modelDependencySummary">
                  <div><strong>Dependencies</strong><span>{modelInfo.dependencies.required.length} referenced</span></div>
                  <div className="dependencyPills">
                    <span className="dependencyOk">{modelInfo.dependencies.required.filter((item) => item.found).length} found</span>
                    <span className={modelInfo.dependencies.missing.length ? "dependencyMissing" : "dependencyOk"}>{modelInfo.dependencies.missing.length} missing</span>
                    <span>{modelInfo.dependencies.suppliedTextures} textures supplied</span>
                  </div>
                  {modelInfo.dependencies.missing.slice(0, 5).map((item) => (
                    <small key={item.path}>Missing {item.kind}: {item.path}</small>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="previewWrap">
              <img src={preview} alt="Source preview" />
              <div className="previewOverlay">
                <div className="previewFileMeta">
                  <span className="fileBadge" title={file?.name}>{file?.name}</span>
                  {imageInputMethod && (
                    <span className="inputMethodBadge">
                      {imageInputMethod === "clipboard" ? "Clipboard" : imageInputMethod === "drag-drop" ? "Drag & drop" : "File"}
                    </span>
                  )}
                </div>
                <button type="button" className="replaceBtn" onClick={openFilePicker} disabled={busy}>
                  <ImagePlus size={15} /> Replace
                </button>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            hidden
            type="file"
            accept={FILE_ACCEPT}
            multiple
            onChange={(event) => chooseFiles(event.target.files, "file")}
          />

          <div className="imageInputToolbar">
            <div className="imageInputHint">
              <span className="inputHintIcon"><UploadCloud size={14} /></span>
              <div><strong>Image + 3D input</strong><span>Drop models here; paste still works for copied images.</span></div>
            </div>
            <div className="imageInputButtons">
              <button type="button" onClick={openFilePicker} disabled={busy}>
                <ImagePlus size={14} /> Browse files
              </button>
              <button type="button" className="pasteImageBtn" onClick={pasteImageFromClipboard} disabled={busy}>
                <Copy size={14} /> Paste image <kbd>Ctrl+V</kbd>
              </button>
            </div>
          </div>

          {recentImports.length > 0 && (
            <div className="recentImportsPanel">
              <div className="recentImportsHead">
                <div><strong>Recent 3D imports</strong><small>Local history only — files are not uploaded or stored.</small></div>
                <button type="button" onClick={clearRecentImports}>Clear</button>
              </div>
              <div className="recentImportsList">
                {recentImports.map((item) => (
                  <div className="recentImportRow" key={item.id}>
                    <span className="recentFormat">{item.format}</span>
                    <div><strong title={item.name}>{item.name}</strong><small>{formatBytes(item.size)} · {item.files} file{item.files === 1 ? "" : "s"}</small></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="savedProjectsPanel">
            <div className="savedProjectsHead">
              <div><strong>Saved projects</strong><small>Camera Studio settings are saved locally in this browser.</small></div>
              <button type="button" onClick={saveProjectLocally}><Save size={12} /> Save current</button>
            </div>
            {savedProjects.length ? (
              <div className="savedProjectsList">
                {savedProjects.slice(0, 5).map((item) => (
                  <div className="savedProjectRow" key={item.id}>
                    <button type="button" className="savedProjectOpen" onClick={() => applyProjectSnapshot(item.snapshot, `Saved project “${item.name}”`)}>
                      <strong>{item.name}</strong>
                      <small>{item.assetName} · {new Date(item.savedAt).toLocaleDateString()}</small>
                    </button>
                    <button type="button" className="savedProjectDelete" onClick={() => deleteSavedProject(item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="savedProjectsEmpty">No saved Camera Studio projects yet.</div>
            )}
          </div>

          {assetType === "model" && (
            <div className="sceneOutlinerPanel">
              <div className="sceneOutlinerHead">
                <div><strong>Scene / Outliner</strong><small>{sceneGraph ? `${sceneNodeCount} nodes` : "Waiting for model"} · Ctrl-click multi-select</small></div>
                <div className="sceneOutlinerHeadActions">
                  <button type="button" title="Frame selected (F)" onClick={frameSelectedObjects} disabled={!selectedSceneIds.length}>F</button>
                  <button type="button" title="Isolate selected" onClick={isolateSelectedObjects} disabled={!selectedSceneIds.length}><Eye size={11} /></button>
                  <button type="button" title="Show all objects" onClick={() => threeViewportRef.current?.showAllObjects?.()}><EyeOff size={11} /></button>
                </div>
              </div>
              <label className="outlinerSearchBox"><Search size={12} /><input value={outlinerSearch} onChange={(event) => setOutlinerSearch(event.target.value)} placeholder="Search scene…" /></label>
              <div className="sceneOutlinerTree">{filteredSceneGraph ? renderSceneNode(filteredSceneGraph, 0, { count: 0, limit: outlinerSearch.trim() ? 3000 : 1200 }) : <div className="outlinerEmpty">Import a 3D model to build the scene hierarchy.</div>}</div>
              {filteredSceneGraph && filteredSceneNodeCount > (outlinerSearch.trim() ? 3000 : 1200) && <div className="outlinerLimitNote">Large scene: showing the first {outlinerSearch.trim() ? "3,000" : "1,200"} matching nodes. Use Search or collapse groups to narrow the tree.</div>}
              <div className="outlinerFooterActions">
                <button type="button" onClick={duplicateSelectedObjects} disabled={!selectedSceneIds.length}><CopyPlus size={12} /> Duplicate</button>
                <button type="button" onClick={() => selectedSceneIds.length >= 2 && threeViewportRef.current?.parentObjects?.(selectedSceneIds.slice(1), selectedSceneIds[0])} disabled={selectedSceneIds.length < 2}>Parent</button>
                <button type="button" onClick={() => threeViewportRef.current?.parentObjects?.(selectedSceneIds, null)} disabled={!selectedSceneIds.length}>Unparent</button>
                <button type="button" onClick={deleteSelectedObjects} disabled={!selectedSceneIds.length}><Trash2 size={12} /> Delete</button>
              </div>
              {selectedModelObject && (
                <div className="selectedObjectStats">
                  <span><b>{selectedModelObject.name}</b><small>{selectedModelObject.type || "Object"}</small></span>
                  <span><b>{Number(selectedModelObject.stats?.triangles || 0).toLocaleString()}</b><small>triangles</small></span>
                  <span><b>{Number(selectedModelObject.stats?.vertices || 0).toLocaleString()}</b><small>vertices</small></span>
                </div>
              )}
            </div>
          )}

          {assetType === "model" ? (
            <div className="modelReferenceInfo">
              <div className="modelReferenceIcon"><Rotate3d size={16} /></div>
              <div>
                <strong>Free 3D camera reference</strong>
                <small>A 3D model has no fixed source camera. Use the 3D Camera Control to choose the render viewpoint.</small>
                <span>{modelFormat.toUpperCase()} · {fileBundle.length} local file{fileBundle.length === 1 ? "" : "s"} · no upload to a server</span>
              </div>
            </div>
          ) : (
            <div className="currentViewPicker">
              <div className="currentViewPickerHead">
                <div>
                  <strong>Current/source camera view</strong>
                  <small>Select what the uploaded image currently shows. No AI analysis is used.</small>
                </div>
                <span className="manualPill">Manual</span>
              </div>
              <div className="selectWrap">
                <select value={currentViewKey} onChange={(event) => { setCurrentViewKey(event.target.value); resetRunState(); }} disabled={busy}>
                  {ANGLES.map((angle) => (
                    <option key={`source-${angle.key}`} value={angle.key}>{angle.label} · {viewDescription(angle.key)}</option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
          )}


        </div>

        <div className="panel anglePanel uiReveal uiRevealDelay1">
          <div className="panelHead blenderEditorHeader">
            <span className="blenderEditorType">3D VIEWPORT</span>
            <div className="panelTitle">
              <span className="step">02</span>
              <div>
                <h2>Camera angles</h2>
                <p>Choose presets or switch to custom 3D control.</p>
              </div>
            </div>
            <span className="count">{angleMode === "3d" ? "Custom 3D" : `${selected.length} selected`}</span>
          </div>

          <div className="angleModeTabs cleanTabs">
            <button type="button" className={angleMode === "preset" ? "active" : ""} onClick={() => changeAngleMode("preset")} disabled={busy}>
              <Rotate3d size={14} /> <span>Preset angles</span>
            </button>
            <button type="button" className={angleMode === "3d" ? "active" : ""} onClick={() => changeAngleMode("3d")} disabled={busy}>
              <Orbit size={14} /> <span>3D Camera Control</span>
            </button>
          </div>

          {angleMode === "preset" ? (
            <>
              <div className="angleGrid">
                {ANGLES.map((angle) => {
                  const active = selected.includes(angle.key);
                  return (
                    <button
                      type="button"
                      key={angle.key}
                      className={`angleCard ${active ? "active" : ""}`}
                      onClick={() => toggleAngle(angle.key)}
                      aria-pressed={active}
                      disabled={busy}
                    >
                      <span className="angleVisual"><Rotate3d size={20} /><b>{angle.deg}</b></span>
                      <span className="angleText"><strong>{angle.label}</strong><small>{angle.hint}</small></span>
                      <span className="check" aria-hidden="true">{active && <Check size={13} />}</span>
                    </button>
                  );
                })}
              </div>

              <div className="quickActions">
                <button
                  type="button"
                  onClick={() => setSelected(ANGLES.map((angle) => angle.key))}
                  disabled={busy || selected.length === ANGLES.length}
                >
                  Select all
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  disabled={busy || selected.length === 0}
                >
                  Clear
                </button>
              </div>
            </>
          ) : (
            <div className="camera3dPanel proCameraPanel editor3dPanel">
              <div className="editor3dHeader">
                <div className="editor3dTitle">
                  <span className="camera3dIcon"><Orbit size={16} /></span>
                  <div>
                    <strong>Camera Inspector</strong>
                    <small>Position, lens, focus, and framing for the target view.</small>
                  </div>
                </div>
                <div className="editor3dHeaderActions">
                  <span className="cameraLiveBadge"><i /> TARGET ACTIVE</span>
                  <button type="button" className="editorResetBtn" onClick={resetCameraControl} disabled={busy}><Rotate3d size={13} /> Reset</button>
                </div>
              </div>

              <div className="sourceTargetBar">
                <div className="sourceTargetSide sourceTargetSource">
                  <small>SOURCE</small>
                  <strong>{currentViewLabel}</strong>
                  <span>{assetType === "model" ? "Free camera around loaded geometry" : viewDescription(currentViewKey)}</span>
                </div>
                <div className="sourceTargetArrow" aria-hidden="true">→</div>
                <div className="sourceTargetSide sourceTargetDestination">
                  <small>TARGET</small>
                  <strong>{cameraSummary.short}</strong>
                  <span>{cameraSummary.label} · {lensLabel(lensPreset)} · Focus {focusBadgeText(focusPoint, focusPosition)}</span>
                </div>
              </div>

              <div className="cameraEditorLayout">
                <section className="cameraEditorViewport">
                  <div className="cameraViewportToolbar">
                    <div>
                      {assetType === "model" ? (
                        <>
                          <span><Rotate3d size={13} /> Drag = orbit</span>
                          <span>Shift + drag = pan</span>
                          <span>Wheel = dolly</span>
                        </>
                      ) : (
                        <>
                          <span><Rotate3d size={13} /> Drag to orbit</span>
                          <span><Crosshair size={13} /> Click to set focus</span>
                        </>
                      )}
                    </div>
                    <span className="viewportPresetPill">Nearest: {ANGLES.find((item) => item.key === nearestPreset)?.label || nearestPreset}</span>
                  </div>

                  <div
                    ref={cameraStageRef}
                    className={`proCameraStage cameraViewportStage ${orbiting ? "isOrbiting" : ""} ${orbitAuto ? "isAutoOrbiting" : ""}`}
                    onWheel={assetType === "model" ? undefined : handleWheelDistance}
                    onKeyDown={handleStageKeyDown}
                    onDoubleClick={assetType === "model" ? undefined : handleStageDoubleClick}
                    tabIndex={0}
                    aria-label="3D camera viewport. Drag to orbit, wheel to zoom, arrow keys to adjust camera."
                  >
                    <div className="proStageGrid" />
                    <div className="proStageGlow" />

                    <div className="blenderToolShelf" aria-label="Viewport tools">
                      <button type="button" className="active" title="Orbit camera" onClick={() => cameraStageRef.current?.focus()}><Orbit size={15} /></button>
                      <button type="button" title="Center focus" onClick={() => setFocusPreset("center")}><Crosshair size={15} /></button>
                      <button type="button" title="Reset camera" onClick={resetCameraControl}><Camera size={15} /></button>
                      <button type="button" title="Replace reference asset" onClick={openFilePicker}><ImagePlus size={15} /></button>
                    </div>

                    <div className="cameraStageHud cameraStageHudLeft">
                      <span><small>AZ</small><b>{Math.round(camera.azimuth)}°</b></span>
                      <span><small>EL</small><b>{Math.round(camera.elevation)}°</b></span>
                      <span><small>LENS</small><b>{lensLabel(lensPreset)}</b></span>
                      <span><small>ZOOM</small><b>{100 - Math.round(camera.distance)}%</b></span>
                      <span className={orbitAuto ? "hudLoopActive" : ""}><small>LOOP</small><b>{orbitAuto ? `${orbitAutoSpeed}°/s` : "OFF"}</b></span>
                    </div>

                    <div className="stageCameraGizmo" aria-label="Camera orientation gizmo">
                      <div className="gizmoCubeWrap">
                        <button
                          type="button"
                          className={`gizmoCubeFace gizmoCubeTop ${isCameraNearPreset(camera, CAMERA_GIZMO_VIEWS[0]) ? "active" : ""}`}
                          onClick={(event) => { event.stopPropagation(); applyCameraPreset(0, 65, 48); }}
                          disabled={busy}
                          title="Top view"
                        >TOP</button>
                        <button
                          type="button"
                          className={`gizmoCubeFace gizmoCubeFront ${isCameraNearPreset(camera, CAMERA_GIZMO_VIEWS[2]) ? "active" : ""}`}
                          onClick={(event) => { event.stopPropagation(); applyCameraPreset(0, 0, 42); }}
                          disabled={busy}
                          title="Front view"
                        >F</button>
                        <button
                          type="button"
                          className={`gizmoCubeFace gizmoCubeRight ${isCameraNearPreset(camera, CAMERA_GIZMO_VIEWS[3]) ? "active" : ""}`}
                          onClick={(event) => { event.stopPropagation(); applyCameraPreset(90, 0, 42); }}
                          disabled={busy}
                          title="Right view"
                        >R</button>
                      </div>
                      <div className="gizmoSecondaryButtons">
                        <button type="button" className={isCameraNearPreset(camera, CAMERA_GIZMO_VIEWS[1]) ? "active" : ""} onClick={(event) => { event.stopPropagation(); applyCameraPreset(270, 0, 42); }} disabled={busy}>L</button>
                        <button type="button" className={isCameraNearPreset(camera, CAMERA_GIZMO_VIEWS[4]) ? "active" : ""} onClick={(event) => { event.stopPropagation(); applyCameraPreset(180, 0, 44); }} disabled={busy}>B</button>
                        <button type="button" className={isCameraNearPreset(camera, CAMERA_GIZMO_VIEWS[5]) ? "active" : ""} onClick={(event) => { event.stopPropagation(); applyCameraPreset(0, -24, 40); }} disabled={busy}>LOW</button>
                      </div>
                    </div>

                    {assetType === "model" ? (
                      <ViewportErrorBoundary onError={(viewportError) => setError(`3D viewport: ${viewportError?.message || "unexpected error"}`)}>
                        <Suspense fallback={<div className="threeLazyFallback">Loading 3D engine…</div>}>
                          <ThreeModelViewport
                            ref={threeViewportRef}
                            mainFile={file}
                            files={fileBundle}
                            cameraState={camera}
                            lensPreset={lensPreset}
                            focusPosition={focusPosition}
                            projectionMode={viewportProjection}
                            shadingMode={viewportShading}
                            showGrid={viewportGrid}
                            showGround={viewportGround}
                            modelTransform={modelTransform}
                            resetTransformSignal={modelTransformResetSignal}
                            selectedObjectIds={selectedSceneIds}
                            lightingConfig={lightingConfig}
                            customEnvironmentFile={customEnvironmentFile}
                            qualityMode={qualityMode}
                            className="stageThreeModelViewer"
                            onModelInfo={setModelInfo}
                            onLoadState={setModelLoadState}
                            onSelectionChange={handleSceneSelection}
                            onSceneGraphChange={setSceneGraph}
                            onMaterialInfo={setMaterialInfo}
                            onPerformanceInfo={setPerformanceInfo}
                            onCameraStateChange={handleModelCameraChange}
                            onError={(message) => setError(`3D model: ${message}`)}
                          />
                        </Suspense>
                      </ViewportErrorBoundary>
                    ) : (
                      <div className="cameraPreview3d proPreview3d editorPreview3d" aria-hidden="true">
                        <div
                          className="cameraObject3d proObject3d"
                          style={{
                            transform: `translateZ(${previewTranslateZ}px) rotateX(${previewRotateX}deg) rotateY(${previewRotateY}deg) scale(${previewScale})`,
                          }}
                        >
                          <div className="face face-front">
                            {preview ? <img src={preview} alt="" /> : <div className="facePlaceholder">Preview</div>}
                          </div>
                          <div className="face face-back" />
                          <div className="face face-right" />
                          <div className="face face-left" />
                          <div className="face face-top" />
                          <div className="face face-bottom" />
                        </div>
                      </div>
                    )}

                    {assetType !== "model" && (
                      <>
                        <div
                          className="editorFocusTarget"
                          style={{ left: `${focusPosition.x}%`, top: `${focusPosition.y}%` }}
                          aria-hidden="true"
                        >
                          <Crosshair size={15} />
                        </div>

                        <svg
                          viewBox="0 0 340 260"
                          className="cameraSvg proOrbitSurface editorOrbitSurface"
                          onPointerDown={startStageOrbit}
                          onPointerMove={moveStageOrbit}
                          onPointerUp={endStageOrbit}
                          onPointerCancel={cancelStageOrbit}
                          onLostPointerCapture={cancelStageOrbit}
                        >
                          <rect x="0" y="0" width="340" height="260" fill="transparent" />
                        </svg>
                      </>
                    )}

                    <div className="cameraStageHint powerOrbitHints">
                      {assetType === "model" ? (
                        <>
                          <span>Drag = orbit actual model</span>
                          <span>Shift + drag = pan</span>
                          <span>Wheel = dolly</span>
                          <span>Click mesh = select</span>
                        </>
                      ) : (
                        <>
                          <span>Drag = 360° orbit</span>
                          <span>Shift + drag = precision</span>
                          <span>Wheel = smooth zoom</span>
                          <span>Arrows = nudge</span>
                          <span>Space = auto loop</span>
                        </>
                      )}
                    </div>
                    {assetType === "model" && debugEnabled && (
                      <div className="viewportDebugPanel">
                        <div><span>FPS</span><b>{performanceInfo.fps || 0}</b></div>
                        <div><span>Quality</span><b>{performanceInfo.quality || qualityMode}</b></div>
                        <div><span>Draw calls</span><b>{performanceInfo.calls || 0}</b></div>
                        <div><span>Render tris</span><b>{Number(performanceInfo.triangles || 0).toLocaleString()}</b></div>
                        <div><span>GPU geometries</span><b>{performanceInfo.geometries || 0}</b></div>
                        <div><span>GPU textures</span><b>{performanceInfo.textures || 0}</b></div>
                        <div><span>VRAM estimate</span><b>{formatBytes(performanceInfo.estimatedGpuBytes || 0)}</b></div>
                        <div className="debugWide"><span>GPU</span><b title={performanceInfo.gpuName || ""}>{performanceInfo.gpuName || performanceInfo.renderer || "WebGL"}</b></div>
                        <div><span>Geometry mem</span><b>{formatBytes(performanceInfo.geometryBytes || 0)}</b></div>
                        <div><span>Texture mem</span><b>{formatBytes(performanceInfo.textureBytes || 0)}</b></div>
                      </div>
                    )}
                  </div>

                  <div className="cameraViewportSummary">
                    <div>
                      <small>PROMPT-READY TARGET</small>
                      <strong>{cameraSummary.short}</strong>
                    </div>
                    <div className="cameraSummaryMetrics">
                      <span><b>{Math.round(camera.azimuth)}°</b><small>Azimuth</small></span>
                      <span><b>{Math.round(camera.elevation)}°</b><small>Elevation</small></span>
                      <span><b>{Math.round(camera.distance)}%</b><small>Distance</small></span>
                      <span><b>{lensLabel(lensPreset)}</b><small>Lens</small></span>
                    </div>
                  </div>
                </section>

                <aside className="cameraEditorControls">
                  {assetType === "model" && (
                    <section className="cameraControlSection realViewportSection">
                      <div className="cameraControlSectionHead">
                        <div><strong>Real 3D Viewport</strong><small>Projection, shading, scene helpers, and selection</small></div>
                        <span className="viewportModeBadge">{viewportProjection === "orthographic" ? "ORTHO" : "PERSP"}</span>
                      </div>

                      <div className="viewportControlGroup">
                        <span className="viewportControlLabel">Projection</span>
                        <div className="viewportSegmented two">
                          <button type="button" className={viewportProjection === "perspective" ? "active" : ""} onClick={() => setViewportProjection("perspective")}>Perspective</button>
                          <button type="button" className={viewportProjection === "orthographic" ? "active" : ""} onClick={() => setViewportProjection("orthographic")}>Orthographic</button>
                        </div>
                      </div>

                      <div className="viewportControlGroup">
                        <span className="viewportControlLabel">Shading</span>
                        <div className="viewportSegmented shading">
                          {["material", "solid", "wireframe", "normal"].map((mode) => (
                            <button type="button" key={mode} className={viewportShading === mode ? "active" : ""} onClick={() => setViewportShading(mode)}>{mode === "material" ? "Material" : mode === "solid" ? "Solid" : mode === "wireframe" ? "Wire" : "Normal"}</button>
                          ))}
                        </div>
                      </div>

                      <div className="viewportControlGroup">
                        <span className="viewportControlLabel">Performance quality</span>
                        <div className="viewportSegmented quality">
                          {["auto", "low", "medium", "high", "ultra"].map((mode) => (
                            <button type="button" key={mode} className={qualityMode === mode ? "active" : ""} onClick={() => setQualityMode(mode)}>{mode === "auto" ? `Auto${performanceInfo.quality && performanceInfo.quality !== "auto" ? ` · ${performanceInfo.quality}` : ""}` : mode}</button>
                          ))}
                        </div>
                      </div>

                      <div className="viewportToggleRow">
                        <button type="button" className={viewportGrid ? "active" : ""} onClick={() => setViewportGrid((value) => !value)}><b>Grid</b><span>{viewportGrid ? "ON" : "OFF"}</span></button>
                        <button type="button" className={viewportGround ? "active" : ""} onClick={() => setViewportGround((value) => !value)}><b>Ground</b><span>{viewportGround ? "ON" : "OFF"}</span></button>
                      </div>

                      <div className="viewportSelectionRow">
                        <div><small>Selected object</small><strong>{selectedModelObject?.name || "None"}</strong></div>
                        <button type="button" onClick={resetModelTransform}>Reset model transform</button>
                      </div>
                      <p className="viewportHelpText">Left drag: orbit · Shift + left drag: pan · Wheel: dolly · Click a mesh: select</p>
                    </section>
                  )}

                  {assetType === "model" && (
                    <section className="cameraControlSection objectTransformSection">
                      <div className="cameraControlSectionHead">
                        <div><strong>Object Transform</strong><small>Transform the imported model without changing its source file.</small></div>
                        <button type="button" className="miniResetButton" onClick={resetModelTransform}>Reset</button>
                      </div>

                      {["position", "rotation", "scale"].map((group) => (
                        <div className="transformGroup" key={group}>
                          <span className="transformGroupLabel">{group === "position" ? "Position" : group === "rotation" ? "Rotation" : "Scale"}</span>
                          <div className="transformAxisGrid">
                            {["x", "y", "z"].map((axis) => (
                              <label key={`${group}-${axis}`}>
                                <b>{axis.toUpperCase()}</b>
                                <input
                                  type="number"
                                  step={group === "rotation" ? "1" : group === "scale" ? "0.01" : "0.05"}
                                  value={modelTransform[group][axis]}
                                  onChange={(event) => updateModelTransform(group, axis, event.target.value)}
                                />
                                <i>{group === "rotation" ? "°" : group === "scale" ? "×" : "u"}</i>
                              </label>
                            ))}
                          </div>
                          {group === "scale" && (
                            <div className="uniformScaleRow">
                              <span>Uniform</span>
                              {[0.5, 1, 1.5, 2].map((value) => (
                                <button type="button" key={value} onClick={() => setUniformModelScale(value)}>{value}×</button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </section>
                  )}

                  {assetType === "model" && (
                    <details className="cameraControlSection studioModuleSection materialStudioSection" open>
                      <summary><Palette size={13} /><span><b>Material Studio</b><small>Edit selected mesh materials live</small></span><ChevronDown size={13} /></summary>
                      <div className="studioModuleBody">
                        {materialInfo.materials.length ? (
                          <>
                            <div className="materialSlotList">
                              {materialInfo.materials.map((material) => (
                                <button type="button" key={material.id} className={activeMaterial?.id === material.id ? "active" : ""} onClick={() => setActiveMaterialId(material.id)}>
                                  <span className="materialSwatch" style={{ background: material.color }} />
                                  <span><b>{material.name}</b><small>{material.type} · {material.textures.length} texture{material.textures.length === 1 ? "" : "s"}</small></span>
                                </button>
                              ))}
                            </div>
                            {activeMaterial && (
                              <div className="materialEditorGrid">
                                <label><span>Base color</span><input type="color" value={activeMaterial.color} onChange={(event) => updateActiveMaterial({ color: event.target.value })} /></label>
                                <label><span>Emissive</span><input type="color" value={activeMaterial.emissive} onChange={(event) => updateActiveMaterial({ emissive: event.target.value })} /></label>
                                {activeMaterial.roughness != null && <label className="materialRange"><span>Roughness <b>{Number(activeMaterial.roughness).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={activeMaterial.roughness} onChange={(event) => updateActiveMaterial({ roughness: Number(event.target.value) })} /></label>}
                                {activeMaterial.metalness != null && <label className="materialRange"><span>Metallic <b>{Number(activeMaterial.metalness).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={activeMaterial.metalness} onChange={(event) => updateActiveMaterial({ metalness: Number(event.target.value) })} /></label>}
                                <label className="materialRange"><span>Opacity <b>{Number(activeMaterial.opacity).toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" value={activeMaterial.opacity} onChange={(event) => updateActiveMaterial({ opacity: Number(event.target.value) })} /></label>
                                <button type="button" className={activeMaterial.doubleSided ? "toggleActive" : ""} onClick={() => updateActiveMaterial({ doubleSided: !activeMaterial.doubleSided })}>Double-sided {activeMaterial.doubleSided ? "ON" : "OFF"}</button>
                                <div className="materialTextureStudio">
                                  <div className="materialTextureStudioHead"><span>Texture maps</span><small>Click Replace or drop a texture onto a slot.</small></div>
                                  {[
                                    ["map", "Base Color"],
                                    ["normalMap", "Normal"],
                                    ["roughnessMap", "Roughness"],
                                    ["metalnessMap", "Metallic"],
                                    ["emissiveMap", "Emissive"],
                                    ["alphaMap", "Alpha"],
                                  ].map(([slot, label]) => {
                                    const detail = activeMaterial.textureDetails?.find((item) => item.slot === slot);
                                    const attached = activeMaterial.textures.includes(slot);
                                    return (
                                      <div
                                        className={`materialTextureSlot ${attached ? "attached" : ""}`}
                                        key={slot}
                                        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                                        onDrop={(event) => handleMaterialTextureDrop(event, slot)}
                                      >
                                        <span className="materialTexturePreview">{detail?.src ? <img src={detail.src} alt="" /> : <Palette size={13} />}</span>
                                        <span className="materialTextureName"><b>{label}</b><small>{detail?.name || (attached ? "Attached" : "Empty")}</small></span>
                                        <button type="button" onClick={() => requestMaterialTexture(slot)}>Replace</button>
                                        <button type="button" className="textureRemoveButton" onClick={() => threeViewportRef.current?.removeMaterialTexture?.(activeMaterial.id, slot)} disabled={!attached} aria-label={`Remove ${label} texture`}><Trash2 size={11} /></button>
                                      </div>
                                    );
                                  })}
                                  {modelInfo?.dependencies?.missing?.length > 0 && (
                                    <div className="missingAssetBox">
                                      <div><strong>Missing assets</strong><small>{modelInfo.dependencies.missing.length} referenced file{modelInfo.dependencies.missing.length === 1 ? "" : "s"} not found.</small></div>
                                      <ul>{modelInfo.dependencies.missing.slice(0, 6).map((item) => <li key={`${item.kind}-${item.path}`}>{item.path}</li>)}</ul>
                                      <button type="button" onClick={openRelinkFilesPicker}><FolderOpen size={11} /> Add / relink files</button>
                                    </div>
                                  )}
                                  {modelInfo?.materials?.textured > 0 && modelInfo?.materials?.uvMeshes === 0 && <div className="materialUvWarning">Texture maps are present, but no UV coordinates were detected on the model.</div>}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="studioModuleEmpty">Select a mesh in the viewport or Outliner to edit its material.</div>
                        )}
                      </div>
                    </details>
                  )}

                  {assetType === "model" && (
                    <details className="cameraControlSection studioModuleSection lightingStudioSection">
                      <summary><SunMedium size={13} /><span><b>Lighting Studio</b><small>Environment + key/fill/rim lighting</small></span><ChevronDown size={13} /></summary>
                      <div className="studioModuleBody">
                        <div className="lightingPresetGrid">
                          {LIGHTING_PRESETS.map((preset) => (
                            <button type="button" key={preset.key} className={lightingConfig.preset === preset.key ? "active" : ""} onClick={() => applyLightingPreset(preset.key)}>
                              <b>{preset.label}</b><small>{preset.sub}</small>
                            </button>
                          ))}
                        </div>
                        {lightingConfig.preset === "custom" && <div className="customEnvironmentRow"><span>{customEnvironmentFile?.name || "No HDR/EXR selected"}</span><button type="button" onClick={openEnvironmentPicker}>Choose HDRI</button></div>}
                        <label className="lightingSlider"><span>Environment <b>{Number(lightingConfig.environmentStrength).toFixed(2)}</b></span><input type="range" min="0" max="3" step="0.05" value={lightingConfig.environmentStrength} onChange={(event) => updateLighting({ environmentStrength: Number(event.target.value) })} /></label>
                        <label className="lightingSlider"><span>Environment rotation <b>{Math.round(lightingConfig.environmentRotation)}°</b></span><input type="range" min="0" max="360" step="1" value={lightingConfig.environmentRotation} onChange={(event) => updateLighting({ environmentRotation: Number(event.target.value) })} /></label>
                        <div className="lightingIntensityGrid">
                          {[['keyIntensity','Key'],['fillIntensity','Fill'],['rimIntensity','Rim'],['ambientIntensity','Ambient']].map(([key,label]) => (
                            <label key={key}><span>{label}</span><input type="number" min="0" max="10" step="0.05" value={lightingConfig[key]} onChange={(event) => updateLighting({ [key]: Math.max(0, Number(event.target.value) || 0) })} /></label>
                          ))}
                        </div>
                        <label className="lightingSlider"><span>Temperature <b>{Math.round(lightingConfig.temperature)}K</b></span><input type="range" min="2500" max="10000" step="100" value={lightingConfig.temperature} onChange={(event) => updateLighting({ temperature: Number(event.target.value) })} /></label>
                        <div className="lightingToggleGrid">
                          <button type="button" className={lightingConfig.shadows ? "active" : ""} onClick={() => updateLighting({ shadows: !lightingConfig.shadows })}>Shadows {lightingConfig.shadows ? "ON" : "OFF"}</button>
                          <button type="button" className={lightingConfig.transparentBackground ? "active" : ""} onClick={() => updateLighting({ transparentBackground: !lightingConfig.transparentBackground })}>Transparent BG {lightingConfig.transparentBackground ? "ON" : "OFF"}</button>
                        </div>
                      </div>
                    </details>
                  )}

                  {assetType === "model" && (
                    <details className="cameraControlSection studioModuleSection exportStudioSection">
                      <summary><Download size={13} /><span><b>Export Studio</b><small>Images, JSON, prompt, project, and camera batches</small></span><ChevronDown size={13} /></summary>
                      <div className="studioModuleBody">
                        <div className="exportFormatGrid">
                          {["png", "jpeg", "webp"].map((format) => <button type="button" key={format} className={exportConfig.format === format ? "active" : ""} onClick={() => setExportConfig((current) => ({ ...current, format }))}>{format === "jpeg" ? "JPEG" : format.toUpperCase()}</button>)}
                        </div>
                        <div className="exportScaleGrid">
                          {[1,2,4,"custom"].map((scale) => <button type="button" key={scale} className={exportConfig.scale === scale ? "active" : ""} onClick={() => setExportConfig((current) => ({ ...current, scale }))}>{scale === "custom" ? "Custom" : `${scale}×`}</button>)}
                        </div>
                        {exportConfig.scale === "custom" && (
                          <div className="exportCustomSize"><label><span>W</span><input type="number" min="64" max="8192" value={exportConfig.customWidth} onChange={(event) => setExportConfig((current) => ({ ...current, customWidth: clamp(numberOr(event.target.value, current.customWidth), 64, 8192) }))} /></label><span>×</span><label><span>H</span><input type="number" min="64" max="8192" value={exportConfig.customHeight} onChange={(event) => setExportConfig((current) => ({ ...current, customHeight: clamp(numberOr(event.target.value, current.customHeight), 64, 8192) }))} /></label></div>
                        )}
                        <button type="button" className={exportConfig.transparent ? "exportTransparent active" : "exportTransparent"} disabled={exportConfig.format !== "png"} onClick={() => setExportConfig((current) => ({ ...current, transparent: !current.transparent }))}>Transparent PNG {exportConfig.transparent ? "ON" : "OFF"}</button>
                        <button type="button" className="exportPrimaryButton" onClick={() => exportViewportScreenshot()}><Camera size={13} /> Export viewport image</button>
                        <div className="exportDataGrid">
                          <button type="button" onClick={exportCameraJson}><FileJson size={12} /> Camera JSON</button>
                          <button type="button" onClick={exportSceneJson}><FileJson size={12} /> Scene JSON</button>
                          <button type="button" onClick={exportTransformJson}><FileJson size={12} /> Transform JSON</button>
                          <button type="button" onClick={exportPromptTxt}><Download size={12} /> Prompt TXT</button>
                          <button type="button" onClick={exportMultiviewProject}><Download size={12} /> .multiview</button>
                          <button type="button" onClick={copyCameraConfiguration}><Copy size={12} /> Copy camera</button>
                        </div>
                        <div className="savedCameraPanel">
                          <div className="savedCameraHead"><strong>Saved cameras</strong><button type="button" onClick={saveCurrentCamera}><Save size={11} /> Save camera</button></div>
                          {savedCameras.length ? savedCameras.map((saved) => (
                            <div className="savedCameraRow" key={saved.id}><button type="button" onClick={() => applySavedCamera(saved)}><b>{saved.name}</b><small>Az {Math.round(saved.camera.azimuth)}° · El {Math.round(saved.camera.elevation)}° · {saved.lensPreset}</small></button><button type="button" onClick={() => deleteSavedCamera(saved.id)}><Trash2 size={11} /></button></div>
                          )) : <small className="savedCameraEmpty">No saved cameras yet.</small>}
                          <button type="button" className="batchExportButton" onClick={batchExportSavedCameras} disabled={!savedCameras.length}><Download size={12} /> Batch screenshots ZIP</button>
                        </div>
                      </div>
                    </details>
                  )}

                  <section className="cameraControlSection orbitEngineSection">
                    <div className="cameraControlSectionHead">
                      <div className="controlHeadWithIcon"><span className="controlHeadIcon"><Orbit size={13} /></span><div><strong>Power Orbit Engine</strong><small>360° loop, inertia, snap, and precision control</small></div></div>
                      <span className={`orbitEngineState ${orbitAuto ? "active" : ""}`}>{orbitAuto ? "LOOPING" : orbiting ? "DRAGGING" : "READY"}</span>
                    </div>

                    <div className="orbitEngineActions">
                      <button
                        type="button"
                        className={`autoOrbitButton ${orbitAuto ? "active" : ""}`}
                        onClick={toggleAutoOrbit}
                        disabled={busy}
                      >
                        <span className="autoOrbitGlyph">{orbitAuto ? "■" : "▶"}</span>
                        <span><b>{orbitAuto ? "Stop 360 loop" : "Start 360 loop"}</b><small>Space key</small></span>
                      </button>

                      <div className="orbitToggleGrid">
                        <button type="button" className={orbitInertia ? "active" : ""} onClick={toggleOrbitInertiaSetting} disabled={busy}>
                          <b>Inertia</b><span>{orbitInertia ? "ON" : "OFF"}</span>
                        </button>
                        <button type="button" className={orbitSnap ? "active" : ""} onClick={toggleOrbitSnapSetting} disabled={busy}>
                          <b>Snap 15°</b><span>{orbitSnap ? "ON" : "OFF"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="orbitSensitivityRow">
                      <span>Sensitivity</span>
                      <div className="orbitSensitivitySegmented">
                        {["precision", "normal", "fast"].map((item) => (
                          <button type="button" key={item} className={orbitSensitivity === item ? "active" : ""} onClick={() => setOrbitSensitivity(item)} disabled={busy}>
                            {item === "precision" ? "Precision" : item === "fast" ? "Fast" : "Normal"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="orbitSpeedRow">
                      <span><b>Loop speed</b><output>{orbitAutoSpeed}°/s</output></span>
                      <input type="range" min="6" max="72" step="1" value={orbitAutoSpeed} onChange={(event) => setOrbitAutoSpeed(Number(event.target.value))} disabled={busy} />
                    </label>

                    <div className="orbitShortcutBar">
                      <span>← → orbit</span><span>↑ ↓ height</span><span>+ − zoom</span><span>Home reset</span>
                    </div>
                  </section>

                  <section className="cameraControlSection cameraPresetSection">
                    <div className="cameraControlSectionHead">
                      <div className="controlHeadWithIcon"><span className="controlHeadIcon"><Camera size={13} /></span><div><strong>Camera presets</strong><small>Full camera recipes</small></div></div>
                    </div>
                    <div className="cameraRecipeGrid">
                      {CAMERA_PRESET_CARDS.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={`cameraRecipeCard ${activeRecipeKey === item.key ? "active" : ""}`}
                          onClick={() => applyCameraPreset(item.azimuth, item.elevation, item.distance, item.lens, item.focus)}
                          disabled={busy}
                        >
                          <span className="cameraRecipeIcon"><Camera size={14} /></span>
                          <span className="cameraRecipeCopy">
                            <strong>{item.title}</strong>
                            <small>{item.subtitle}</small>
                            <em>Az {item.azimuth}° · El {item.elevation}° · {item.lens}</em>
                          </span>
                          {activeRecipeKey === item.key && <Check size={14} className="cameraRecipeCheck" />}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="cameraControlSection">
                    <div className="cameraControlSectionHead">
                      <div className="controlHeadWithIcon"><span className="controlHeadIcon"><Orbit size={13} /></span><div><strong>Position</strong><small>Drag or type exact values</small></div></div>
                    </div>

                    <label className="editorSliderRow">
                      <span><b>Azimuth</b><small>Orbit around subject</small></span>
                      <div className="editorSliderControl">
                        <input type="range" min="0" max="359" step="1" value={Math.round(camera.azimuth)} onChange={(event) => updateCameraManual((current) => ({ ...current, azimuth: Number(event.target.value) }))} disabled={busy} />
                        <input type="number" min="0" max="359" value={Math.round(camera.azimuth)} onChange={(event) => updateCameraManual((current) => ({ ...current, azimuth: clamp(numberOr(event.target.value, current.azimuth), 0, 359) }))} disabled={busy} />
                        <i>°</i>
                      </div>
                    </label>

                    <label className="editorSliderRow">
                      <span><b>Elevation</b><small>Camera height</small></span>
                      <div className="editorSliderControl">
                        <input type="range" min="-60" max="85" step="1" value={Math.round(camera.elevation)} onChange={(event) => updateCameraManual((current) => ({ ...current, elevation: Number(event.target.value) }))} disabled={busy} />
                        <input type="number" min="-60" max="85" value={Math.round(camera.elevation)} onChange={(event) => updateCameraManual((current) => ({ ...current, elevation: numberOr(event.target.value, current.elevation) }))} disabled={busy} />
                        <i>°</i>
                      </div>
                    </label>

                    <label className="editorSliderRow">
                      <span><b>Distance</b><small>Close to wide framing</small></span>
                      <div className="editorSliderControl">
                        <input type="range" min="0" max="100" step="1" value={Math.round(camera.distance)} onChange={(event) => updateCameraManual((current) => ({ ...current, distance: Number(event.target.value) }))} disabled={busy} />
                        <input type="number" min="0" max="100" value={Math.round(camera.distance)} onChange={(event) => updateCameraManual((current) => ({ ...current, distance: numberOr(event.target.value, current.distance) }))} disabled={busy} />
                        <i>%</i>
                      </div>
                    </label>
                  </section>

                  <section className="cameraControlSection">
                    <div className="cameraControlSectionHead">
                      <div className="controlHeadWithIcon"><span className="controlHeadIcon"><Aperture size={13} /></span><div><strong>Lens / FOV</strong><small>{activeLens.description}</small></div></div>
                    </div>
                    <div className="lensSegmented" role="group" aria-label="Lens field of view">
                      {LENS_PRESETS.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={lensPreset === item.key ? "active" : ""}
                          onClick={() => { setLensPreset(item.key); resetRunState(); }}
                          disabled={busy}
                          title={item.description}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="cameraControlSection">
                    <div className="cameraControlSectionHead">
                      <div className="controlHeadWithIcon"><span className="controlHeadIcon"><Crosshair size={13} /></span><div><strong>Focus point</strong><small>Click the preview for a custom target</small></div></div>
                      <span className="focusReadout">{focusBadgeText(focusPoint, focusPosition)}</span>
                    </div>
                    <div className="focusShortcutGrid">
                      {FOCUS_POINTS.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={focusPoint === item.key ? "active" : ""}
                          onClick={() => setFocusPreset(item.key)}
                          disabled={busy}
                        >
                          <Crosshair size={12} /> {item.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <details className="cameraFineTune">
                    <summary><Rotate3d size={13} /> <span>Fine tune</span><ChevronDown size={13} className="fineTuneChevron" /></summary>
                    <div className="cameraFineTuneGrid">
                      <button type="button" onClick={() => adjustAzimuth(-15)} disabled={busy}>Az −15°</button>
                      <button type="button" onClick={() => adjustAzimuth(15)} disabled={busy}>Az +15°</button>
                      <button type="button" onClick={() => adjustElevation(5)} disabled={busy}>El +5°</button>
                      <button type="button" onClick={() => adjustElevation(-5)} disabled={busy}>El −5°</button>
                      <button type="button" onClick={() => adjustDistance(-5)} disabled={busy}>Zoom in</button>
                      <button type="button" onClick={() => adjustDistance(5)} disabled={busy}>Zoom out</button>
                    </div>
                  </details>

                  <div className="cameraStickySummary">
                    <div>
                      <small>ACTIVE CAMERA</small>
                      <strong>Az {Math.round(camera.azimuth)}° · El {Math.round(camera.elevation)}° · {lensLabel(lensPreset)} · Focus {focusBadgeText(focusPoint, focusPosition)}</strong>
                      <span>{cameraSummary.short} · Orbit {orbitSensitivity}{orbitInertia ? " + inertia" : ""}{orbitSnap ? " + snap 15°" : ""}</span>
                    </div>
                    <button type="button" onClick={useCameraSetup} disabled={busy}>
                      <Check size={14} /> <span>Apply camera</span>
                    </button>
                  </div>
                </aside>
              </div>
            </div>
          )}
        </div>

        <div className="panel settingsPanel uiReveal uiRevealDelay2">
          <div className="panelHead blenderEditorHeader">
            <span className="blenderEditorType">PROPERTIES</span>
            <div className="panelTitle">
              <span className="step">03</span>
              <div>
                <h2>Prompt settings</h2>
                <p>Control framing, background, and preservation instructions.</p>
              </div>
            </div>
          </div>

          {angleMode === "3d" && (
            <div className="selectedCameraSetup">
              <span className="selectedCameraSetupIcon"><Camera size={15} /></span>
              <div>
                <small>SELECTED 3D CAMERA</small>
                <strong>{cameraSummary.short}</strong>
                <span>Az {Math.round(camera.azimuth)}° · El {Math.round(camera.elevation)}° · Dist {Math.round(camera.distance)}% · {lensLabel(lensPreset)} · Focus {focusBadgeText(focusPoint, focusPosition)}</span>
              </div>
            </div>
          )}

          <div className="settingsGrid">
            <label>
              <span>Target background</span>
              <div className="selectWrap">
                <select value={background} onChange={(event) => { setBackground(event.target.value); setError(""); }} disabled={busy}>
                  <option value="white">Pure white studio</option>
                  <option value="original">Keep original scene</option>
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
            <label>
              <span>Prompt framing</span>
              <div className="selectWrap">
                <select value={size} onChange={(event) => { setSize(event.target.value); setError(""); }} disabled={busy}>
                  <option value="1024x1024">Square · 1:1</option>
                  <option value="1536x1024">Landscape · 3:2</option>
                  <option value="1024x1536">Portrait · 2:3</option>
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
          </div>

          {angleMode === "preset" && (
            <div className="presetPromptCameraOptions">
              <label>
                <span>Lens / FOV</span>
                <div className="selectWrap">
                  <select value={lensPreset} onChange={(event) => { setLensPreset(event.target.value); resetRunState(); }}>
                    {LENS_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.description}</option>)}
                  </select>
                  <ChevronDown size={15} />
                </div>
              </label>
              <label>
                <span>Focus point</span>
                <div className="selectWrap">
                  <select value={focusPoint === "custom" ? "center" : focusPoint} onChange={(event) => setFocusPreset(event.target.value)}>
                    {FOCUS_POINTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  <ChevronDown size={15} />
                </div>
              </label>
            </div>
          )}

          <label className="promptLabel">
            <span>Extra instruction for the generated prompt <small>optional</small></span>
            <textarea
              value={customPrompt}
              onChange={(event) => { setCustomPrompt(event.target.value); setError(""); }}
              maxLength={1000}
              disabled={busy}
              placeholder="Example: keep the exact cup shape, logo placement, drink layers, plate shape, and lighting style..."
            />
            <span className="charCount">{customPrompt.length}/1000</span>
          </label>

          {error && <div className="errorBox" role="alert"><X size={16} /><span>{error}</span></div>}

          <button
            type="button"
            className="generateBtn"
            disabled={!file || (assetType === "model" && modelLoadState.status !== "ready") || (angleMode === "preset" ? !selected.length : false)}
            onClick={runAction}
          >
            <Zap size={18} />
            {`Build ${angleMode === "3d" ? "custom 3D prompt" : `${selected.length || ""} prompt${selected.length === 1 ? "" : "s"}`}`}
          </button>
        </div>
      </section>

      <div className="blenderStatusBar" role="status">
        <div className="blenderStatusLeft">
          <span><b>{safeProjectName(projectName)}</b></span>
          <span>Az {Math.round(camera.azimuth)}°</span>
          <span>El {Math.round(camera.elevation)}°</span>
          <span>Dist {Math.round(camera.distance)}%</span>
          <span>{lensLabel(lensPreset)}</span>
          <span>{assetType === "model" ? viewportProjection === "orthographic" ? "Ortho" : "Perspective" : `Focus ${focusBadgeText(focusPoint, focusPosition)}`}</span>
        </div>
        <div className="blenderStatusRight">
          {assetType === "model" ? (
            <><span>LMB Orbit</span><span>Shift+LMB Pan</span><span>Wheel Dolly</span><span>Click Select</span></>
          ) : (
            <><span>LMB Drag Orbit</span><span>Wheel Zoom</span><span>Shift Precision</span><span>Space Loop</span></>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <section className="resultsSection uiReveal" aria-live="polite">
          <div className="resultsHead">
            <div className="panelTitle">
              <span className="step">04</span>
              <div>
                <h2>ChatGPT-ready prompts</h2>
                <p>{readyCount} prompt{readyCount === 1 ? "" : "s"} ready · generated locally in your browser</p>
              </div>
            </div>
            <button type="button" className="downloadAll" onClick={downloadAllPrompts}>
              <Download size={16} /><span>Download all TXT</span>
            </button>
          </div>

          <div className="promptResultsGrid">
            {results.map((result) => {
              const info = ANGLES.find((angle) => angle.key === result.angleKey);
              const title = result.angleKey === "custom3d" ? "Custom 3D" : (info?.label || result.angleKey);
              const subtitle = result.angleKey === "custom3d"
                ? (result.cameraLabel || cameraSummary.short)
                : `${info?.deg || "Target view"} · Prompt builder`;
              return (
                <article className="promptCard" key={result.angleKey}>
                  <div className="promptCardHead">
                    <div>
                      <strong>{title}</strong>
                      <span>{subtitle}</span>
                    </div>
                    <button
                      type="button"
                      className="copyBtn"
                      onClick={() => copyPrompt(result.prompt, result.angleKey)}
                      title="Copy prompt for ChatGPT"
                    >
                      <Copy size={15} />
                      <span>{copiedKey === result.angleKey ? "Copied" : "Copy for ChatGPT"}</span>
                    </button>
                  </div>

                  <div className="cameraAnalysisCard noAiCameraCard">
                    <div className="cameraAnalysisHead">
                      <div>
                        <strong>{result.assetType === "model" ? "Current/source reference" : "Current/source camera"}</strong>
                        <span>{result.assetType === "model" ? `3D ${(result.modelFormat || "model").toUpperCase()} · free camera` : viewDescription(result.currentViewKey || currentViewKey)}</span>
                      </div>
                      <span className="manualPill">Manual</span>
                    </div>
                  </div>
                  <div className="targetViewCard betterTargetViewCard targetCameraEngineCard">
                    <small>Target camera</small>
                    <strong>{result.angleKey === "custom3d" ? (result.cameraLabel || cameraSummary.short) : `${info?.label || result.angleKey} ${info?.deg ? `· ${info.deg}` : ""}`}</strong>
                    {(() => {
                      const spec = result.targetCameraSpec || getTargetCameraSpec({
                        targetKey: result.angleKey,
                        camera,
                        cameraSummary,
                        lensPreset: result.lensPreset || lensPreset,
                        focusPoint: result.focusPoint || focusPoint,
                        focusPosition: result.focusPosition || focusPosition,
                        size: runSize,
                        projectionMode: result.projectionMode || (result.assetType === "model" ? viewportProjection : "perspective"),
                      });
                      return (
                        <div className="targetCameraSpecGrid">
                          <span><small>View</small><b>{spec.view}</b></span>
                          <span><small>Azimuth</small><b>{spec.azimuth}°</b></span>
                          <span><small>Elevation</small><b>{spec.elevation}°</b></span>
                          <span><small>Distance</small><b>{spec.distance}</b></span>
                          <span><small>Lens / FOV</small><b>{spec.lens}</b></span>
                          <span><small>Projection</small><b>{spec.projection}</b></span>
                          <span><small>Focus</small><b>{spec.focus}</b></span>
                          <span><small>Framing</small><b>{spec.framing}</b></span>
                        </div>
                      );
                    })()}
                  </div>
                  {result.assetType === "model" && result.modelTransform && (
                    <div className="resultTransformCard">
                      <small>Object transform</small>
                      <div>
                        <span>P {result.modelTransform.position.x.toFixed(2)}, {result.modelTransform.position.y.toFixed(2)}, {result.modelTransform.position.z.toFixed(2)}</span>
                        <span>R {result.modelTransform.rotation.x.toFixed(0)}°, {result.modelTransform.rotation.y.toFixed(0)}°, {result.modelTransform.rotation.z.toFixed(0)}°</span>
                        <span>S {result.modelTransform.scale.x.toFixed(2)}, {result.modelTransform.scale.y.toFixed(2)}, {result.modelTransform.scale.z.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <div className="promptMetaBar">
                    <span>{lensLabel(result.lensPreset || lensPreset)} lens</span>
                    <span>Focus: {focusBadgeText(result.focusPoint || focusPoint, result.focusPosition || focusPosition)}</span>
                    <span>{framingDescription(runSize)}</span>
                  </div>
                  <p className="promptUseNote">{result.assetType === "model" ? "Use this prompt with the same 3D asset where supported, or with a clean render/screenshot from this viewport." : "Upload the same reference image to ChatGPT, then paste this prompt."} The prompt includes target view, lens/FOV, and camera focus point.</p>
                  <textarea readOnly value={result.prompt} className="promptOutput" />
                </article>
              );
            })}
          </div>
        </section>
      )}

    </main>
  );
}

export default App;
