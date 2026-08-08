import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { TDSLoader } from "three/addons/loaders/TDSLoader.js";
import { TGALoader } from "three/addons/loaders/TGALoader.js";
import { DDSLoader } from "three/addons/loaders/DDSLoader.js";

const MODEL_EXTENSIONS = new Set(["obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds"]);
const TEXTURE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tga", "dds", "gif"]);

function extensionOf(name = "") {
  return name.toLowerCase().split(".").pop() || "";
}

function normalizedName(value = "") {
  let text = String(value || "");
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep the original when a filename contains an incomplete percent escape.
  }
  return text
    .replace(/^blob:/, "")
    .replace(/[?#].*$/, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function baseName(value = "") {
  return normalizedName(value).split("/").pop() || "";
}

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function safeFileLabel(file) {
  return file?.webkitRelativePath || file?.name || "unknown file";
}

function parseMtlTextureRefs(text = "") {
  const refs = [];
  const textureCommands = /^(map_Ka|map_Kd|map_Ks|map_Ke|map_Ns|map_d|map_bump|bump|disp|decal|norm|refl)\s+(.+)$/i;
  const knownTextureExt = /(?:^|[\s"'])([^"']+?\.(?:png|jpe?g|webp|bmp|tga|dds|gif|tif|tiff))(?:[\s"']|$)/i;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(textureCommands);
    if (!match) continue;
    let value = match[2].trim();
    const pathMatch = value.match(knownTextureExt);
    if (pathMatch?.[1]) value = pathMatch[1].trim();
    else {
      value = value.replace(/^['"]|['"]$/g, "");
      if (/\s/.test(value) && value.startsWith("-")) {
        const tokens = value.match(/"[^"]+"|'[^']+'|\S+/g) || [];
        value = (tokens[tokens.length - 1] || value).replace(/^['"]|['"]$/g, "");
      }
    }
    if (value) refs.push(value);
  }
  return refs;
}

function mtlUsesByteRangeColors(text = "") {
  let maxComponent = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^(Ka|Kd|Ks|Ke)\s+/i.test(line)) continue;
    const values = line.split(/\s+/).slice(1, 4).map(Number).filter(Number.isFinite);
    for (const value of values) maxComponent = Math.max(maxComponent, value);
  }
  return maxComponent > 1.5;
}

function stemOf(name = "") {
  const base = baseName(name);
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(0, index) : base;
}

function findMatchingMtl(mainFile, files, referencedMtl = "") {
  const mtls = files.filter((file) => extensionOf(file.name) === "mtl");
  if (!mtls.length) return null;
  if (referencedMtl) {
    const exact = mtls.find((file) => baseName(file.webkitRelativePath || file.name) === baseName(referencedMtl));
    if (exact) return exact;
  }
  const mainStem = stemOf(mainFile?.name);
  return mtls.find((file) => stemOf(file.name) === mainStem) || mtls[0];
}

async function analyzeDependencies(mainFile, files) {
  const ext = extensionOf(mainFile?.name);
  const availableFull = new Set(files.map((file) => normalizedName(file.webkitRelativePath || file.name)));
  const availableBase = new Set(files.map((file) => baseName(file.webkitRelativePath || file.name)));
  const required = [];
  const notes = [];

  const addRequired = (value, kind) => {
    if (!value || /^data:/i.test(value) || /^https?:/i.test(value)) return;
    required.push({ path: value, kind });
  };

  try {
    if (ext === "obj") {
      const objText = await mainFile.text();
      const mtls = [...objText.matchAll(/^\s*mtllib\s+(.+)$/gim)].map((match) => match[1].trim());
      mtls.forEach((value) => addRequired(value, "material"));

      const mtlFiles = files.filter((file) => extensionOf(file.name) === "mtl");
      for (const mtlFile of mtlFiles) {
        const mtlText = await mtlFile.text();
        parseMtlTextureRefs(mtlText).forEach((value) => addRequired(value, "texture"));
      }
      if (!mtls.length && !mtlFiles.length) notes.push("OBJ has no MTL file; default viewport material will be used.");
    } else if (ext === "gltf") {
      const json = JSON.parse(await mainFile.text());
      (json.buffers || []).forEach((item) => addRequired(item?.uri, "buffer"));
      (json.images || []).forEach((item) => addRequired(item?.uri, "texture"));
    } else if (ext === "dae") {
      const text = await mainFile.text();
      const refs = [...text.matchAll(/<init_from>\s*([^<]+?)\s*<\/init_from>/gi)].map((match) => match[1]);
      refs.forEach((value) => addRequired(value, "texture"));
    } else if (["fbx", "3ds", "3mf"].includes(ext)) {
      notes.push(`${ext.toUpperCase()} can contain embedded resources; external texture references are resolved when matching local files are supplied.`);
    } else if (["stl", "ply", "glb"].includes(ext)) {
      notes.push(ext === "glb" ? "GLB normally contains its dependencies inside one file." : `${ext.toUpperCase()} normally loads as a single geometry file.`);
    }
  } catch (error) {
    notes.push(`Dependency scan could not fully parse ${safeFileLabel(mainFile)}: ${error?.message || "invalid metadata"}.`);
  }

  const deduped = [];
  const seen = new Set();
  for (const item of required) {
    const key = normalizedName(item.path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const found = availableFull.has(key) || availableBase.has(baseName(key));
    deduped.push({ ...item, found });
  }

  const suppliedTextures = files.filter((file) => TEXTURE_EXTENSIONS.has(extensionOf(file.name))).length;
  return {
    required: deduped,
    missing: deduped.filter((item) => !item.found),
    suppliedTextures,
    notes,
  };
}

function disposeMaterial(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    if (!item) continue;
    for (const key of Object.keys(item)) {
      const value = item[key];
      if (value?.isTexture) value.dispose?.();
    }
    item.dispose?.();
  }
}

function disposeObject(object) {
  object?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const original = node.userData?.originalViewportMaterial;
    if (original && original !== node.material) disposeMaterial(original);
    disposeMaterial(node.userData?.generatedViewportMaterial);
    if (!node.userData?.generatedViewportMaterial || node.material !== node.userData.generatedViewportMaterial) {
      disposeMaterial(node.material);
    }
  });
}

function makeDefaultMaterial(geometry = null) {
  const hasVertexColors = Boolean(geometry?.attributes?.color);
  return new THREE.MeshStandardMaterial({
    color: hasVertexColors ? 0xffffff : 0xb8c0ca,
    vertexColors: hasVertexColors,
    roughness: 0.56,
    metalness: 0.08,
  });
}

function prepareObject(object) {
  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let uvMeshCount = 0;
  let materialCount = 0;
  let texturedMaterialCount = 0;
  const materialNames = new Set();
  const names = [];
  object.traverse((node) => {
    if (!node.isMesh) return;
    meshCount += 1;
    if (!node.name) node.name = `Mesh ${meshCount}`;
    names.push(node.name);
    const geometry = node.geometry;
    if (geometry?.attributes?.position) vertexCount += geometry.attributes.position.count || 0;
    if (geometry?.attributes?.uv) uvMeshCount += 1;
    if (geometry?.index) triangleCount += Math.floor((geometry.index.count || 0) / 3);
    else if (geometry?.attributes?.position) triangleCount += Math.floor((geometry.attributes.position.count || 0) / 3);
    if (geometry && !geometry.attributes?.normal) geometry.computeVertexNormals?.();
    if (!node.material) node.material = makeDefaultMaterial(geometry);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      materialCount += 1;
      if (material.name) materialNames.add(material.name);
      if (material.map || material.normalMap || material.bumpMap || material.roughnessMap || material.metalnessMap || material.alphaMap || material.emissiveMap || material.specularMap) texturedMaterialCount += 1;
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    }
    node.userData.originalViewportMaterial = node.material;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return {
    meshCount,
    vertexCount,
    triangleCount,
    uvMeshCount,
    materialCount,
    texturedMaterialCount,
    materialNames: Array.from(materialNames),
    names,
  };
}

function buildFileResolver(files, objectUrls) {
  const byFullName = new Map();
  const byBaseName = new Map();

  for (const file of files) {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    const full = normalizedName(file.webkitRelativePath || file.name);
    const base = full.split("/").pop();
    byFullName.set(full, url);
    if (base && !byBaseName.has(base)) byBaseName.set(base, url);
  }

  return (url) => {
    const normalized = normalizedName(url);
    const base = normalized.split("/").pop();
    return byFullName.get(normalized) || byBaseName.get(base) || url;
  };
}

function createReaderTask(active, file, mode) {
  return new Promise((resolve, reject) => {
    if (active.cancelled) {
      reject(new DOMException("Model loading cancelled", "AbortError"));
      return;
    }
    const reader = new FileReader();
    active.readers.add(reader);
    reader.onerror = () => {
      active.readers.delete(reader);
      reject(reader.error || new Error(`Could not read ${file.name}.`));
    };
    reader.onabort = () => {
      active.readers.delete(reader);
      reject(new DOMException("Model loading cancelled", "AbortError"));
    };
    reader.onload = () => {
      active.readers.delete(reader);
      if (active.cancelled) reject(new DOMException("Model loading cancelled", "AbortError"));
      else resolve(reader.result);
    };
    if (mode === "text") reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

async function loadModel(mainFile, files, manager, active, setProgress) {
  const ext = extensionOf(mainFile.name);
  setProgress(28, `Reading ${mainFile.name}`);

  if (ext === "obj") {
    const objText = await createReaderTask(active, mainFile, "text");
    const referencedMtl = objText.match(/^\s*mtllib\s+(.+)$/im)?.[1]?.trim() || "";
    const mtlFile = findMatchingMtl(mainFile, files, referencedMtl);
    let materials = null;
    if (mtlFile) {
      const mtlText = await createReaderTask(active, mtlFile, "text");
      const normalizeRGB = mtlUsesByteRangeColors(mtlText);
      const mtlLoader = new MTLLoader(manager).setMaterialOptions({
        side: THREE.DoubleSide,
        wrap: THREE.RepeatWrapping,
        normalizeRGB,
        ignoreZeroRGBs: true,
      });
      materials = mtlLoader.parse(mtlText, "");
      materials.preload();
      setProgress(42, `Material library: ${mtlFile.name}${normalizeRGB ? " · RGB normalized" : ""}`);
    }
    const loader = new OBJLoader(manager);
    if (materials) loader.setMaterials(materials);
    setProgress(62, "Parsing OBJ geometry + materials");
    const object = loader.parse(objText);
    object.userData.importMaterialInfo = {
      mtlFile: mtlFile?.name || "",
      referencedMtl,
      hasMaterialLibrary: Boolean(materials),
    };
    return object;
  }

  if (ext === "stl") {
    const geometry = new STLLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"));
    geometry.computeVertexNormals?.();
    return new THREE.Mesh(geometry, makeDefaultMaterial(geometry));
  }

  if (ext === "ply") {
    const geometry = new PLYLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"));
    geometry.computeVertexNormals?.();
    return new THREE.Mesh(geometry, makeDefaultMaterial(geometry));
  }

  if (ext === "glb") {
    const buffer = await createReaderTask(active, mainFile, "buffer");
    return new Promise((resolve, reject) => {
      new GLTFLoader(manager).parse(buffer, "", (gltf) => resolve(gltf.scene), reject);
    });
  }

  if (ext === "gltf") {
    const text = await createReaderTask(active, mainFile, "text");
    return new Promise((resolve, reject) => {
      new GLTFLoader(manager).parse(text, "", (gltf) => resolve(gltf.scene), reject);
    });
  }

  if (ext === "fbx") {
    return new FBXLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"), "");
  }

  if (ext === "dae") {
    return new ColladaLoader(manager).parse(await createReaderTask(active, mainFile, "text"), "").scene;
  }

  if (ext === "3mf") {
    return new ThreeMFLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"));
  }

  if (ext === "3ds") {
    return new TDSLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"), "");
  }

  throw new Error(`Unsupported 3D format: .${ext}`);
}

function normalizeAndGroundObject(object) {
  const rawBox = new THREE.Box3().setFromObject(object);
  if (rawBox.isEmpty()) throw new Error("The model does not contain renderable geometry.");
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDimension = Math.max(rawSize.x, rawSize.y, rawSize.z, 0.0001);
  const scale = 2.5 / maxDimension;
  object.scale.multiplyScalar(scale);
  object.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = scaledBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= scaledBox.min.y;
  object.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(object);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  const radius = Math.max(finalSize.length() * 0.5, 0.6);
  const target = new THREE.Vector3(0, Math.max(finalSize.y * 0.46, 0.05), 0);
  return { finalBox, finalSize, radius, target };
}

function applyShading(root, mode) {
  if (!root) return;
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (node.userData.generatedViewportMaterial) {
      disposeMaterial(node.userData.generatedViewportMaterial);
      node.userData.generatedViewportMaterial = null;
    }
    if (mode === "material") {
      node.material = node.userData.originalViewportMaterial || node.material;
      return;
    }
    const hasVertexColors = Boolean(node.geometry?.attributes?.color);
    let material;
    if (mode === "normal") {
      material = new THREE.MeshNormalMaterial();
    } else if (mode === "wireframe") {
      material = new THREE.MeshBasicMaterial({ color: 0xd8dde5, wireframe: true, vertexColors: false });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0xb7bec8,
        roughness: 0.72,
        metalness: 0.02,
        vertexColors: hasVertexColors,
      });
    }
    node.userData.generatedViewportMaterial = material;
    node.material = material;
  });
}

function warningsForStats(stats, totalBytes, dependencies) {
  const warnings = [];
  if (totalBytes > 80 * 1024 * 1024) warnings.push(`Large model bundle (${formatBytes(totalBytes)}). Browser memory use may be high.`);
  if (stats.triangleCount > 1_000_000) warnings.push(`${stats.triangleCount.toLocaleString()} triangles is very heavy for a browser viewport.`);
  else if (stats.triangleCount > 500_000) warnings.push(`${stats.triangleCount.toLocaleString()} triangles may reduce viewport performance.`);
  if (stats.vertexCount > 1_500_000) warnings.push(`${stats.vertexCount.toLocaleString()} vertices may use substantial GPU memory.`);
  if (dependencies?.missing?.length) warnings.push(`${dependencies.missing.length} referenced file${dependencies.missing.length === 1 ? " is" : "s are"} missing.`);
  if (dependencies?.required?.some((item) => item.kind === "texture") && dependencies.suppliedTextures === 0) {
    warnings.push("The material library references textures, but no texture image files were supplied. Add the texture files with the model.");
  }
  if (stats.materialCount > 0 && stats.texturedMaterialCount === 0 && dependencies?.required?.some((item) => item.kind === "texture")) {
    warnings.push("Materials loaded, but no texture maps are currently attached. Check the missing-texture list and filename matching.");
  }
  if (stats.texturedMaterialCount > 0 && stats.uvMeshCount === 0) {
    warnings.push("Texture maps were loaded, but the mesh has no UV coordinates, so textures may not display correctly.");
  }
  return warnings;
}

export function isSupportedModelFile(file) {
  return Boolean(file && MODEL_EXTENSIONS.has(extensionOf(file.name)));
}

export function supportedModelExtensions() {
  return Array.from(MODEL_EXTENSIONS);
}

const DEFAULT_MODEL_TRANSFORM = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

function normalizedTransform(transform) {
  const source = transform || DEFAULT_MODEL_TRANSFORM;
  const safe = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    position: {
      x: safe(source.position?.x, 0),
      y: safe(source.position?.y, 0),
      z: safe(source.position?.z, 0),
    },
    rotation: {
      x: safe(source.rotation?.x, 0),
      y: safe(source.rotation?.y, 0),
      z: safe(source.rotation?.z, 0),
    },
    scale: {
      x: Math.max(0.001, safe(source.scale?.x, 1)),
      y: Math.max(0.001, safe(source.scale?.y, 1)),
      z: Math.max(0.001, safe(source.scale?.z, 1)),
    },
  };
}

const ThreeModelViewport = forwardRef(function ThreeModelViewport({
  mainFile,
  files = [],
  cameraState,
  lensPreset = "85mm",
  focusPosition = { x: 50, y: 49 },
  className = "",
  projectionMode = "perspective",
  shadingMode = "material",
  showGrid = true,
  showGround = true,
  modelTransform = DEFAULT_MODEL_TRANSFORM,
  resetTransformSignal = 0,
  onModelInfo,
  onLoadState,
  onSelectionChange,
  onCameraStateChange,
  onError,
}, forwardedRef) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const camerasRef = useRef({ perspective: null, orthographic: null });
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const modelRadiusRef = useRef(1);
  const modelTargetRef = useRef(new THREE.Vector3(0, 0.5, 0));
  const baseFocusTargetRef = useRef(new THREE.Vector3(0, 0.5, 0));
  const panOffsetRef = useRef(new THREE.Vector3());
  const modelInitialTransformRef = useRef(null);
  const gridRef = useRef(null);
  const groundRef = useRef(null);
  const axesRef = useRef(null);
  const selectionHelperRef = useRef(null);
  const activeLoadRef = useRef(null);
  const objectUrlsRef = useRef([]);
  const animationRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerDownRef = useRef(null);
  const syncingCameraRef = useRef(false);
  const projectionModeRef = useRef(projectionMode);
  projectionModeRef.current = projectionMode;
  const [status, setStatus] = useState("idle");
  const [progress, setProgressState] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useImperativeHandle(forwardedRef, () => ({
    async captureScreenshot() {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = getActiveCamera();
      if (!renderer || !scene || !camera) throw new Error("3D viewport is not ready.");
      const selectionHelper = selectionHelperRef.current;
      const selectionWasVisible = selectionHelper?.visible;
      if (selectionHelper) selectionHelper.visible = false;
      renderer.render(scene, camera);
      return new Promise((resolve, reject) => {
        renderer.domElement.toBlob((blob) => {
          if (selectionHelper) selectionHelper.visible = selectionWasVisible !== false;
          if (blob) resolve(blob);
          else reject(new Error("Could not capture the viewport."));
        }, "image/png");
      });
    },
    getSelectedObject() {
      return selectedName || "";
    },
    retryLoad() {
      setReloadToken((value) => value + 1);
    },
    cancelLoad() {
      activeLoadRef.current?.cancel?.();
    },
  }), [selectedName]);

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + (file?.size || 0), 0), [files]);

  const setProgress = (value, label) => {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    setProgressState(next);
    if (label) setProgressLabel(label);
    onLoadState?.({ status: "loading", progress: next, label: label || progressLabel });
  };

  const getActiveCamera = () => camerasRef.current[projectionModeRef.current] || camerasRef.current.perspective;

  const syncControlsCamera = () => {
    const renderer = rendererRef.current;
    const camera = getActiveCamera();
    if (!renderer || !camera) return;
    controlsRef.current?.dispose?.();
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.75;
    controls.screenSpacePanning = true;
    controls.target.copy(modelTargetRef.current);
    controls.minPolarAngle = THREE.MathUtils.degToRad(2);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(178);

    const notifyCamera = () => {
      if (syncingCameraRef.current || !onCameraStateChange) return;
      const offset = camera.position.clone().sub(controls.target);
      const radius = Math.max(offset.length(), 0.0001);
      const azimuth = THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
      const elevation = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offset.y / radius, -1, 1)));
      const modelRadius = modelRadiusRef.current || 1;
      const effectiveRadius = projectionModeRef.current === "orthographic"
        ? radius / Math.max(camera.zoom || 1, 0.01)
        : radius;
      const distance = THREE.MathUtils.clamp(((effectiveRadius / modelRadius - 1.5) / 4.2) * 100, 0, 100);
      panOffsetRef.current.copy(controls.target).sub(baseFocusTargetRef.current);
      onCameraStateChange({ azimuth: (azimuth + 360) % 360, elevation, distance });
    };
    controls.addEventListener("change", notifyCamera);

    // Shift + left-drag pans, Blender-style. Normal left-drag orbits.
    const canvas = renderer.domElement;
    const baseLeft = THREE.MOUSE.ROTATE;
    const shiftDown = (event) => {
      if (event.button === 0 && event.shiftKey) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      else controls.mouseButtons.LEFT = baseLeft;
    };
    const restoreLeft = () => { controls.mouseButtons.LEFT = baseLeft; };
    canvas.addEventListener("pointerdown", shiftDown, true);
    window.addEventListener("pointerup", restoreLeft, true);
    controls.userDataCleanup = () => {
      canvas.removeEventListener("pointerdown", shiftDown, true);
      window.removeEventListener("pointerup", restoreLeft, true);
      controls.removeEventListener("change", notifyCamera);
    };
    controlsRef.current = controls;
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202124);
    sceneRef.current = scene;

    const perspective = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
    const orthographic = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 2000);
    perspective.position.set(2.5, 1.6, 3.2);
    orthographic.position.copy(perspective.position);
    camerasRef.current = { perspective, orthographic };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3139, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 6, 5);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ec5ff, 1.05);
    fill.position.set(-4, 2, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.75);
    rim.position.set(0, 3, -5);
    scene.add(rim);

    const grid = new THREE.GridHelper(20, 40, 0x4b5666, 0x313842);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.46;
    });
    gridRef.current = grid;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x292d32, roughness: 1, metalness: 0, transparent: true, opacity: 0.7 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.004;
    ground.receiveShadow = true;
    groundRef.current = ground;
    scene.add(ground);

    const axes = new THREE.AxesHelper(1.25);
    axes.position.set(0, 0.01, 0);
    axesRef.current = axes;
    scene.add(axes);

    const resize = () => {
      const width = Math.max(2, host.clientWidth);
      const height = Math.max(2, host.clientHeight);
      renderer.setSize(width, height, false);
      perspective.aspect = width / height;
      perspective.updateProjectionMatrix();
      const aspect = width / height;
      const span = Math.max(modelRadiusRef.current * 2.5, 2.2);
      orthographic.left = -span * aspect;
      orthographic.right = span * aspect;
      orthographic.top = span;
      orthographic.bottom = -span;
      orthographic.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resizeObserverRef.current = observer;

    const canvas = renderer.domElement;
    const onPointerDown = (event) => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey };
    };
    const onPointerUp = (event) => {
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!start || start.button !== 0 || start.shift) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const camera = getActiveCamera();
      if (!camera || !modelRef.current) return;
      raycasterRef.current.setFromCamera(pointer, camera);
      const hits = raycasterRef.current.intersectObject(modelRef.current, true).filter((hit) => hit.object?.isMesh);
      const selected = hits[0]?.object || null;
      if (selectionHelperRef.current) {
        scene.remove(selectionHelperRef.current);
        selectionHelperRef.current.geometry?.dispose?.();
        disposeMaterial(selectionHelperRef.current.material);
        selectionHelperRef.current = null;
      }
      if (selected) {
        const helper = new THREE.BoxHelper(selected, 0x4ea1ff);
        selectionHelperRef.current = helper;
        scene.add(helper);
        setSelectedName(selected.name || "Mesh");
        onSelectionChange?.({ name: selected.name || "Mesh", uuid: selected.uuid });
      } else {
        setSelectedName("");
        onSelectionChange?.(null);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    syncControlsCamera();

    const renderLoop = () => {
      controlsRef.current?.update?.();
      selectionHelperRef.current?.update?.();
      renderer.render(scene, getActiveCamera());
      animationRef.current = requestAnimationFrame(renderLoop);
    };
    animationRef.current = requestAnimationFrame(renderLoop);

    return () => {
      observer.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      controlsRef.current?.userDataCleanup?.();
      controlsRef.current?.dispose?.();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      if (activeLoadRef.current) {
        activeLoadRef.current.cancelled = true;
        activeLoadRef.current.readers.forEach((reader) => reader.abort?.());
      }
      if (modelRef.current) disposeObject(modelRef.current);
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      disposeMaterial(ground.material);
      ground.geometry.dispose();
      grid.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      rendererRef.current = null;
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!rendererRef.current) return;
    const oldControls = controlsRef.current;
    oldControls?.userDataCleanup?.();
    oldControls?.dispose?.();
    controlsRef.current = null;
    syncControlsCamera();
  }, [projectionMode]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = Boolean(showGrid);
  }, [showGrid]);

  useEffect(() => {
    if (groundRef.current) groundRef.current.visible = Boolean(showGround);
  }, [showGround]);

  useEffect(() => {
    applyShading(modelRef.current, shadingMode);
  }, [shadingMode]);

  useEffect(() => {
    const object = modelRef.current;
    const base = modelInitialTransformRef.current;
    if (!object || !base) return;
    const next = normalizedTransform(modelTransform);
    const radius = modelRadiusRef.current || 1;
    object.position.set(
      base.position.x + next.position.x * radius,
      base.position.y + next.position.y * radius,
      base.position.z + next.position.z * radius,
    );
    const deltaQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(next.rotation.x),
      THREE.MathUtils.degToRad(next.rotation.y),
      THREE.MathUtils.degToRad(next.rotation.z),
      "XYZ",
    ));
    object.quaternion.copy(base.quaternion).multiply(deltaQuaternion);
    object.scale.set(
      base.scale.x * next.scale.x,
      base.scale.y * next.scale.y,
      base.scale.z * next.scale.z,
    );
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      modelRadiusRef.current = Math.max(size.length() * 0.5, 0.25);
      modelTargetRef.current.copy(center);
    }
    selectionHelperRef.current?.update?.();
  }, [modelTransform]);

  useEffect(() => {
    const object = modelRef.current;
    const transform = modelInitialTransformRef.current;
    if (!object || !transform || !resetTransformSignal) return;
    object.position.copy(transform.position);
    object.quaternion.copy(transform.quaternion);
    object.scale.copy(transform.scale);
    object.updateMatrixWorld(true);
    panOffsetRef.current.set(0, 0, 0);
    controlsRef.current?.target.copy(baseFocusTargetRef.current);
    controlsRef.current?.update();
  }, [resetTransformSignal]);

  useEffect(() => {
    if (!mainFile || !sceneRef.current) return undefined;
    const scene = sceneRef.current;
    const objectUrls = [];
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = objectUrls;
    const active = { cancelled: false, finished: false, readers: new Set() };
    activeLoadRef.current = active;

    const cancel = () => {
      active.cancelled = true;
      active.readers.forEach((reader) => reader.abort?.());
      setStatus("cancelled");
      setProgressState(0);
      setProgressLabel("Loading cancelled");
      onLoadState?.({ status: "cancelled", progress: 0, label: "Loading cancelled" });
    };
    active.cancel = cancel;

    async function start() {
      setStatus("loading");
      setSelectedName("");
      onSelectionChange?.(null);
      setProgress(4, "Scanning model bundle");
      try {
        const dependencies = await analyzeDependencies(mainFile, files);
        if (active.cancelled) return;
        setProgress(12, "Checking linked files");

        const manager = new THREE.LoadingManager();
        manager.addHandler(/\.tga(?:$|[?#])/i, new TGALoader(manager));
        manager.addHandler(/\.dds(?:$|[?#])/i, new DDSLoader(manager));
        manager.setURLModifier(buildFileResolver(files, objectUrls));
        manager.onProgress = (_url, loaded, total) => {
          if (!active.cancelled && !active.finished && total > 0) setProgress(64 + (loaded / total) * 18, `Loading linked resources ${loaded}/${total}`);
        };
        manager.onError = (url) => {
          if (!active.cancelled) console.warn("Three.js resource could not be resolved:", url);
        };

        const object = await loadModel(mainFile, files, manager, active, setProgress);
        if (active.cancelled) {
          disposeObject(object);
          return;
        }
        setProgress(78, "Preparing geometry");

        if (modelRef.current) {
          scene.remove(modelRef.current);
          disposeObject(modelRef.current);
        }
        if (selectionHelperRef.current) {
          scene.remove(selectionHelperRef.current);
          selectionHelperRef.current = null;
        }

        const stats = prepareObject(object);
        const normalized = normalizeAndGroundObject(object);
        modelRadiusRef.current = normalized.radius;
        modelTargetRef.current.copy(normalized.target);
        baseFocusTargetRef.current.copy(normalized.target);
        panOffsetRef.current.set(0, 0, 0);
        modelInitialTransformRef.current = {
          position: object.position.clone(),
          quaternion: object.quaternion.clone(),
          scale: object.scale.clone(),
        };
        const importedTransform = normalizedTransform(modelTransform);
        object.position.set(
          modelInitialTransformRef.current.position.x + importedTransform.position.x * normalized.radius,
          modelInitialTransformRef.current.position.y + importedTransform.position.y * normalized.radius,
          modelInitialTransformRef.current.position.z + importedTransform.position.z * normalized.radius,
        );
        const importedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          THREE.MathUtils.degToRad(importedTransform.rotation.x),
          THREE.MathUtils.degToRad(importedTransform.rotation.y),
          THREE.MathUtils.degToRad(importedTransform.rotation.z),
          "XYZ",
        ));
        object.quaternion.copy(modelInitialTransformRef.current.quaternion).multiply(importedRotation);
        object.scale.set(
          modelInitialTransformRef.current.scale.x * importedTransform.scale.x,
          modelInitialTransformRef.current.scale.y * importedTransform.scale.y,
          modelInitialTransformRef.current.scale.z * importedTransform.scale.z,
        );
        object.updateMatrixWorld(true);
        const transformedBox = new THREE.Box3().setFromObject(object);
        if (!transformedBox.isEmpty()) {
          const transformedSize = transformedBox.getSize(new THREE.Vector3());
          const transformedCenter = transformedBox.getCenter(new THREE.Vector3());
          modelRadiusRef.current = Math.max(transformedSize.length() * 0.5, 0.25);
          modelTargetRef.current.copy(transformedCenter);
          baseFocusTargetRef.current.copy(transformedCenter);
        }
        scene.add(object);
        modelRef.current = object;
        applyShading(object, shadingMode);

        const warnings = warningsForStats(stats, totalBytes, dependencies);
        const format = extensionOf(mainFile.name).toUpperCase();
        const info = {
          format,
          meshes: stats.meshCount,
          vertices: stats.vertexCount,
          triangles: stats.triangleCount,
          dimensions: normalized.finalSize,
          files: files.length,
          totalBytes,
          dependencies,
          warnings,
          objectNames: stats.names,
          grounded: true,
          materials: {
            count: stats.materialCount,
            textured: stats.texturedMaterialCount,
            names: stats.materialNames,
            uvMeshes: stats.uvMeshCount,
            mtlFile: object.userData?.importMaterialInfo?.mtlFile || "",
            referencedMtl: object.userData?.importMaterialInfo?.referencedMtl || "",
            hasMaterialLibrary: Boolean(object.userData?.importMaterialInfo?.hasMaterialLibrary),
          },
        };
        setProgress(94, "Framing camera");
        onModelInfo?.(info);

        // Rebuild controls so the orbit target is the normalized model center.
        controlsRef.current?.userDataCleanup?.();
        controlsRef.current?.dispose?.();
        syncControlsCamera();
        active.finished = true;
        setProgress(100, "Ready");
        setStatus("ready");
        onLoadState?.({ status: "ready", progress: 100, label: "Ready", warnings, dependencies });
      } catch (error) {
        if (error?.name === "AbortError" || active.cancelled) return;
        console.error("3D model load failed", error);
        const ext = extensionOf(mainFile?.name).toUpperCase() || "3D";
        let message = error instanceof Error ? error.message : "Could not load the 3D model.";
        if (/JSON/i.test(message) && extensionOf(mainFile?.name) === "gltf") message = "The glTF file contains invalid JSON or references a corrupt resource.";
        else if (/unsupported/i.test(message)) message = `${ext} is not supported by this build.`;
        else if (/unexpected|parse|invalid|malformed/i.test(message)) message = `${ext} appears to be corrupted or uses unsupported data. ${message}`;
        setStatus("error");
        setProgressState(0);
        setProgressLabel(message);
        onLoadState?.({ status: "error", progress: 0, label: message });
        onError?.(message);
      }
    }

    start();
    return () => {
      active.cancelled = true;
      active.readers.forEach((reader) => reader.abort?.());
      for (const url of objectUrls) URL.revokeObjectURL(url);
      if (activeLoadRef.current === active) activeLoadRef.current = null;
    };
  }, [mainFile, files, reloadToken]);

  useEffect(() => {
    const perspective = camerasRef.current.perspective;
    const orthographic = camerasRef.current.orthographic;
    const controls = controlsRef.current;
    if (!perspective || !orthographic || !controls) return;

    const azimuth = THREE.MathUtils.degToRad(Number(cameraState?.azimuth || 0));
    const elevation = THREE.MathUtils.degToRad(Number(cameraState?.elevation || 0));
    const radius = modelRadiusRef.current || 1;
    const normalizedDistance = THREE.MathUtils.clamp(Number(cameraState?.distance ?? 42), 0, 100) / 100;
    const orbitDistance = radius * (1.5 + normalizedDistance * 4.2);
    const cosEl = Math.cos(elevation);
    const target = modelTargetRef.current.clone();
    const position = new THREE.Vector3(
      Math.sin(azimuth) * cosEl * orbitDistance,
      Math.sin(elevation) * orbitDistance,
      Math.cos(azimuth) * cosEl * orbitDistance,
    ).add(target);

    syncingCameraRef.current = true;
    perspective.position.copy(position);
    orthographic.position.copy(position);
    const focalLength = Number(String(lensPreset).replace(/[^0-9.]/g, "")) || 50;
    perspective.setFocalLength(Math.max(12, Math.min(300, focalLength)));
    perspective.near = Math.max(0.01, orbitDistance / 1000);
    perspective.far = Math.max(200, orbitDistance * 80);
    perspective.updateProjectionMatrix();

    const focusX = ((Number(focusPosition?.x ?? 50) - 50) / 50) * radius * 0.34;
    const focusY = ((50 - Number(focusPosition?.y ?? 49)) / 50) * radius * 0.34;
    const focusTarget = target.clone().add(new THREE.Vector3(focusX, focusY, 0));
    baseFocusTargetRef.current.copy(focusTarget);
    const pannedTarget = focusTarget.clone().add(panOffsetRef.current);
    controls.target.copy(pannedTarget);
    perspective.lookAt(pannedTarget);
    orthographic.lookAt(pannedTarget);
    orthographic.zoom = 1;

    const host = hostRef.current;
    if (host) {
      const aspect = Math.max(host.clientWidth, 2) / Math.max(host.clientHeight, 2);
      const span = orbitDistance * 0.42;
      orthographic.left = -span * aspect;
      orthographic.right = span * aspect;
      orthographic.top = span;
      orthographic.bottom = -span;
      orthographic.near = perspective.near;
      orthographic.far = perspective.far;
      orthographic.updateProjectionMatrix();
    }
    controls.update();
    syncingCameraRef.current = false;
  }, [cameraState, lensPreset, focusPosition, projectionMode, modelTransform]);

  const cancelCurrentLoad = () => activeLoadRef.current?.cancel?.();

  return (
    <div ref={hostRef} className={`threeModelViewport realThreeViewport ${className}`}>
      <div className="threeViewportAxisGizmo" aria-hidden="true">
        <span className="axisX">X</span><span className="axisY">Y</span><span className="axisZ">Z</span>
      </div>
      {selectedName && <div className="threeSelectionBadge">Selected: {selectedName}</div>}
      {status === "loading" && (
        <div className="threeModelLoadOverlay">
          <div className="threeModelLoadHead"><strong>Loading 3D model</strong><span>{progress}%</span></div>
          <div className="threeModelProgress"><i style={{ width: `${progress}%` }} /></div>
          <small>{progressLabel || "Preparing model…"}</small>
          <button type="button" onClick={cancelCurrentLoad}>Cancel loading</button>
        </div>
      )}
      {status === "cancelled" && (
        <div className="threeModelStatus threeModelRetryStatus">Model loading cancelled <button type="button" onClick={() => setReloadToken((value) => value + 1)}>Reload</button></div>
      )}
      {status === "error" && (
        <div className="threeModelStatus error threeModelRetryStatus">{progressLabel || "3D model could not be rendered"} <button type="button" onClick={() => setReloadToken((value) => value + 1)}>Retry</button></div>
      )}
    </div>
  );
});

export default ThreeModelViewport;
