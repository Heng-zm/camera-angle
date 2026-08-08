import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


const MODEL_EXTENSIONS = new Set(["obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds"]);
const TEXTURE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tga", "dds", "gif", "ktx2"]);
const WORKER_FORMATS = new Set(["obj", "stl", "ply"]);
const WORKER_THRESHOLD_BYTES = 4 * 1024 * 1024;
const LOCAL_DECODER_ROOT = "/three-decoders";

const loaderImports = {
  obj: () => import("three/addons/loaders/OBJLoader.js"),
  mtl: () => import("three/addons/loaders/MTLLoader.js"),
  stl: () => import("three/addons/loaders/STLLoader.js"),
  ply: () => import("three/addons/loaders/PLYLoader.js"),
  gltf: () => import("three/addons/loaders/GLTFLoader.js"),
  fbx: () => import("three/addons/loaders/FBXLoader.js"),
  dae: () => import("three/addons/loaders/ColladaLoader.js"),
  "3mf": () => import("three/addons/loaders/3MFLoader.js"),
  "3ds": () => import("three/addons/loaders/TDSLoader.js"),
  tga: () => import("three/addons/loaders/TGALoader.js"),
  dds: () => import("three/addons/loaders/DDSLoader.js"),
  draco: () => import("three/addons/loaders/DRACOLoader.js"),
  ktx2: () => import("three/addons/loaders/KTX2Loader.js"),
  hdr: () => import("three/addons/loaders/HDRLoader.js"),
  exr: () => import("three/addons/loaders/EXRLoader.js"),
};

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

async function readTextSample(file, maxBytes = 4 * 1024 * 1024, includeTail = false) {
  if (!file) return "";
  if (file.size <= maxBytes) return file.text();
  const headBytes = includeTail ? Math.floor(maxBytes * 0.75) : maxBytes;
  const head = await file.slice(0, headBytes).text();
  if (!includeTail) return head;
  const tailBytes = Math.max(0, maxBytes - headBytes);
  const tail = tailBytes ? await file.slice(Math.max(0, file.size - tailBytes), file.size).text() : "";
  return `${head}
${tail}`;
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
      const objText = await readTextSample(mainFile, 2 * 1024 * 1024, false);
      const mtls = [...objText.matchAll(/^\s*mtllib\s+(.+)$/gim)].map((match) => match[1].trim());
      if (mainFile.size > 2 * 1024 * 1024) notes.push("Large OBJ dependency scan used a lightweight header sample to avoid blocking the UI.");
      mtls.forEach((value) => addRequired(value, "material"));

      const mtlFiles = files.filter((file) => extensionOf(file.name) === "mtl");
      for (const mtlFile of mtlFiles) {
        const mtlText = await readTextSample(mtlFile, 16 * 1024 * 1024, true);
        parseMtlTextureRefs(mtlText).forEach((value) => addRequired(value, "texture"));
      }
      if (!mtls.length && !mtlFiles.length) notes.push("OBJ has no MTL file; default viewport material will be used.");
    } else if (ext === "gltf") {
      const json = JSON.parse(await mainFile.text());
      (json.buffers || []).forEach((item) => addRequired(item?.uri, "buffer"));
      (json.images || []).forEach((item) => addRequired(item?.uri, "texture"));
    } else if (ext === "dae") {
      const text = await readTextSample(mainFile, 8 * 1024 * 1024, true);
      const refs = [...text.matchAll(/<init_from>\s*([^<]+?)\s*<\/init_from>/gi)].map((match) => match[1]);
      if (mainFile.size > 8 * 1024 * 1024) notes.push("Large DAE dependency scan used sampled metadata to protect UI responsiveness.");
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
  const seenGeometry = new Set();
  const seenMaterial = new Set();
  const seenTexture = new Set();
  const disposeMaterialOnce = (candidate) => {
    const materials = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
    for (const material of materials) {
      if (!material || seenMaterial.has(material)) continue;
      seenMaterial.add(material);
      for (const key of Object.keys(material)) {
        const texture = material[key];
        if (texture?.isTexture && !seenTexture.has(texture)) {
          seenTexture.add(texture);
          texture.dispose?.();
        }
      }
      material.dispose?.();
    }
  };
  object?.traverse?.((node) => {
    if (node.geometry && !seenGeometry.has(node.geometry)) {
      seenGeometry.add(node.geometry);
      node.geometry.dispose?.();
    }
    disposeMaterialOnce(node.userData?.originalViewportMaterial);
    disposeMaterialOnce(node.userData?.generatedViewportMaterial);
    disposeMaterialOnce(node.material);
  });
}

function collectResourceRefs(root, excludedRoot = null) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((node) => {
    if (excludedRoot && (node === excludedRoot || excludedRoot.getObjectById?.(node.id))) return;
    if (node.geometry) geometries.add(node.geometry);
    const candidates = [node.material, node.userData?.originalViewportMaterial, node.userData?.generatedViewportMaterial];
    for (const candidate of candidates) {
      const list = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
      for (const material of list) {
        if (!material) continue;
        materials.add(material);
        for (const key of Object.keys(material)) {
          const texture = material[key];
          if (texture?.isTexture) textures.add(texture);
        }
      }
    }
  });
  return { geometries, materials, textures };
}

function disposeDetachedObject(object, remainingRoot) {
  const preserved = collectResourceRefs(remainingRoot, object);
  const disposedGeometry = new Set();
  const disposedMaterial = new Set();
  const disposedTexture = new Set();
  object?.traverse?.((node) => {
    if (node.geometry && !preserved.geometries.has(node.geometry) && !disposedGeometry.has(node.geometry)) {
      disposedGeometry.add(node.geometry);
      node.geometry.dispose?.();
    }
    const candidates = [node.material, node.userData?.originalViewportMaterial, node.userData?.generatedViewportMaterial];
    for (const candidate of candidates) {
      const list = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
      for (const material of list) {
        if (!material || preserved.materials.has(material) || disposedMaterial.has(material)) continue;
        disposedMaterial.add(material);
        for (const key of Object.keys(material)) {
          const texture = material[key];
          if (texture?.isTexture && !preserved.textures.has(texture) && !disposedTexture.has(texture)) {
            disposedTexture.add(texture);
            texture.dispose?.();
          }
        }
        material.dispose?.();
      }
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

async function prepareObject(object, onProgress = null, shouldCancel = null) {
  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let uvMeshCount = 0;
  let materialCount = 0;
  let texturedMaterialCount = 0;
  const materialNames = new Set();
  const uniqueMaterials = new Set();
  const texturedMaterials = new Set();
  const names = [];
  const meshes = [];
  object.traverse((node) => { if (node.isMesh) meshes.push(node); });
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    if (shouldCancel?.()) throw new DOMException("Model loading cancelled", "AbortError");
    const node = meshes[meshIndex];
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
      const materialKey = material.uuid || material;
      uniqueMaterials.add(materialKey);
      if (material.name) materialNames.add(material.name);
      if (material.map || material.normalMap || material.bumpMap || material.roughnessMap || material.metalnessMap || material.alphaMap || material.emissiveMap || material.specularMap) texturedMaterials.add(materialKey);
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    }
    node.userData.originalViewportMaterial = node.material;
    node.castShadow = true;
    node.receiveShadow = true;
    if (meshIndex > 0 && meshIndex % 75 === 0) {
      onProgress?.(meshIndex / Math.max(meshes.length, 1));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (shouldCancel?.()) throw new DOMException("Model loading cancelled", "AbortError");
    }
  }
  if (shouldCancel?.()) throw new DOMException("Model loading cancelled", "AbortError");
  materialCount = uniqueMaterials.size;
  texturedMaterialCount = texturedMaterials.size;
  onProgress?.(1);
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
    reader.onprogress = (event) => {
      if (event.lengthComputable && active.fileProgress) active.fileProgress(file, event.loaded, event.total);
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


function typedArrayFrom(spec) {
  if (!spec?.buffer || !spec?.type) return null;
  const ctor = {
    Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Uint16Array,
    Uint32Array, Int8Array, Int16Array, Int32Array,
  }[spec.type];
  if (!ctor) throw new Error(`Unsupported worker array type: ${spec.type}`);
  return new ctor(spec.buffer, spec.byteOffset || 0, spec.length);
}

function materialFromWorker(spec, materialCreator = null) {
  if (materialCreator && spec?.name) {
    try {
      const material = materialCreator.create(spec.name);
      if (material) {
        material.side = THREE.DoubleSide;
        return material;
      }
    } catch {
      // Fall through to a generated material.
    }
  }
  return new THREE.MeshStandardMaterial({
    name: spec?.name || "",
    color: spec?.color ?? 0xb8c0ca,
    emissive: spec?.emissive ?? 0x000000,
    opacity: Number.isFinite(spec?.opacity) ? spec.opacity : 1,
    transparent: Boolean(spec?.transparent || (spec?.opacity ?? 1) < 1),
    roughness: Number.isFinite(spec?.roughness) ? spec.roughness : 0.58,
    metalness: Number.isFinite(spec?.metalness) ? spec.metalness : 0.05,
    wireframe: Boolean(spec?.wireframe),
    vertexColors: Boolean(spec?.vertexColors),
    side: THREE.DoubleSide,
  });
}

async function reconstructWorkerObject(serialized, materialCreator = null, onProgress = null, shouldCancel = null) {
  let built = 0;
  let total = 0;
  const count = (node) => {
    total += 1;
    (node?.children || []).forEach(count);
  };
  count(serialized);

  const build = async (node) => {
    if (shouldCancel?.()) throw new DOMException("Model loading cancelled", "AbortError");
    let object;
    if (node.type === "Mesh" || node.type === "Points" || node.type === "Line") {
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(node.geometry?.attributes || {})) {
        const array = typedArrayFrom(attribute.array);
        if (array) geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
      }
      if (node.geometry?.index?.array) {
        const indexArray = typedArrayFrom(node.geometry.index.array);
        if (indexArray) geometry.setIndex(new THREE.BufferAttribute(indexArray, 1, false));
      }
      for (const group of node.geometry?.groups || []) geometry.addGroup(group.start, group.count, group.materialIndex || 0);
      if (node.geometry?.drawRange) geometry.setDrawRange(node.geometry.drawRange.start || 0, node.geometry.drawRange.count ?? Infinity);
      if (!geometry.attributes.normal && geometry.attributes.position && node.type === "Mesh") geometry.computeVertexNormals();
      const mats = (node.materials || []).map((item) => materialFromWorker(item, materialCreator));
      const material = mats.length > 1 ? mats : (mats[0] || makeDefaultMaterial(geometry));
      object = node.type === "Points"
        ? new THREE.Points(geometry, material)
        : node.type === "Line"
          ? new THREE.Line(geometry, material)
          : new THREE.Mesh(geometry, material);
    } else {
      object = new THREE.Group();
    }
    object.name = node.name || "Object";
    object.position.fromArray(node.position || [0, 0, 0]);
    object.quaternion.fromArray(node.quaternion || [0, 0, 0, 1]);
    object.scale.fromArray(node.scale || [1, 1, 1]);
    object.visible = node.visible !== false;
    for (const child of node.children || []) object.add(await build(child));
    built += 1;
    if (built % 20 === 0) {
      onProgress?.(built / Math.max(total, 1));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (shouldCancel?.()) throw new DOMException("Model loading cancelled", "AbortError");
    }
    return object;
  };
  const result = await build(serialized);
  if (shouldCancel?.()) {
    disposeObject(result);
    throw new DOMException("Model loading cancelled", "AbortError");
  }
  onProgress?.(1);
  return result;
}

async function loadMtlCreator(mainFile, files, manager, active) {
  const objText = await createReaderTask(active, mainFile, "text");
  const referencedMtl = objText.match(/^\s*mtllib\s+(.+)$/im)?.[1]?.trim() || "";
  const mtlFile = findMatchingMtl(mainFile, files, referencedMtl);
  if (!mtlFile) return { creator: null, referencedMtl, mtlFile: null, objText };
  const mtlText = await createReaderTask(active, mtlFile, "text");
  const normalizeRGB = mtlUsesByteRangeColors(mtlText);
  const { MTLLoader } = await loaderImports.mtl();
  const creator = new MTLLoader(manager).setMaterialOptions({
    side: THREE.DoubleSide,
    wrap: THREE.RepeatWrapping,
    normalizeRGB,
    ignoreZeroRGBs: true,
  }).parse(mtlText, "");
  creator.preload();
  return { creator, referencedMtl, mtlFile, objText, normalizeRGB };
}

async function loadMtlCreatorForWorker(mainFile, files, manager, active) {
  const headText = await mainFile.slice(0, Math.min(mainFile.size, 2 * 1024 * 1024)).text();
  if (active.cancelled) throw new DOMException("Model loading cancelled", "AbortError");
  const referencedMtl = headText.match(/^\s*mtllib\s+(.+)$/im)?.[1]?.trim() || "";
  const mtlFile = findMatchingMtl(mainFile, files, referencedMtl);
  if (!mtlFile) return { creator: null, referencedMtl, mtlFile: null };
  const mtlText = await createReaderTask(active, mtlFile, "text");
  const normalizeRGB = mtlUsesByteRangeColors(mtlText);
  const { MTLLoader } = await loaderImports.mtl();
  const creator = new MTLLoader(manager).setMaterialOptions({
    side: THREE.DoubleSide,
    wrap: THREE.RepeatWrapping,
    normalizeRGB,
    ignoreZeroRGBs: true,
  }).parse(mtlText, "");
  creator.preload();
  return { creator, referencedMtl, mtlFile, normalizeRGB };
}

async function parseInWorker(mainFile, format, active, setProgress, materialCreator = null, preloadedText = null) {
  const worker = new Worker(new URL("./modelParser.worker.js", import.meta.url), { type: "module" });
  active.worker = worker;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {};
  const transfers = [];
  if (format === "obj" && preloadedText != null) payload.text = preloadedText;
  else {
    payload.buffer = await createReaderTask(active, mainFile, "buffer");
    transfers.push(payload.buffer);
  }
  return new Promise((resolve, reject) => {
    active.workerReject = reject;
    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (active.worker === worker) active.worker = null;
      if (active.workerReject === reject) active.workerReject = null;
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event?.message || "Model worker crashed."));
    };
    worker.onmessage = async (event) => {
      const message = event.data || {};
      if (message.id !== id) return;
      if (message.type === "progress") {
        setProgress(28 + Math.round((message.progress || 0) * 0.34), message.label || "Worker parsing geometry");
        return;
      }
      if (message.type === "error") {
        cleanup();
        reject(new Error(message.message || "Worker parse failed."));
        return;
      }
      if (message.type === "done") {
        cleanup();
        try {
          const object = await reconstructWorkerObject(message.payload, materialCreator, (ratio) => {
            setProgress(62 + ratio * 12, "Building scene progressively");
          }, () => active.cancelled);
          resolve(object);
        } catch (error) {
          reject(error);
        }
      }
    };
    worker.postMessage({ id, format, payload }, transfers);
  });
}

async function configureGltfLoader(manager, renderer) {
  const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, meshoptModule] = await Promise.all([
    loaderImports.gltf(),
    loaderImports.draco(),
    loaderImports.ktx2(),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const loader = new GLTFLoader(manager);
  const draco = new DRACOLoader(manager).setDecoderPath(`${LOCAL_DECODER_ROOT}/draco/`);
  const ktx2 = new KTX2Loader(manager).setTranscoderPath(`${LOCAL_DECODER_ROOT}/basis/`);
  if (renderer) ktx2.detectSupport(renderer);
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(meshoptModule.MeshoptDecoder || meshoptModule.default || meshoptModule);
  loader.userData = { draco, ktx2 };
  return loader;
}

async function loadModel(mainFile, files, manager, active, setProgress, renderer = null) {
  const ext = extensionOf(mainFile.name);
  setProgress(24, `Reading ${mainFile.name}`);

  if (WORKER_FORMATS.has(ext) && mainFile.size >= WORKER_THRESHOLD_BYTES) {
    if (ext === "obj") {
      const mtl = await loadMtlCreatorForWorker(mainFile, files, manager, active);
      setProgress(31, mtl.mtlFile ? `Worker parsing OBJ + ${mtl.mtlFile.name}` : "Worker parsing OBJ geometry");
      const object = await parseInWorker(mainFile, ext, active, setProgress, mtl.creator, null);
      object.userData.importMaterialInfo = {
        mtlFile: mtl.mtlFile?.name || "",
        referencedMtl: mtl.referencedMtl,
        hasMaterialLibrary: Boolean(mtl.creator),
        workerParsed: true,
      };
      return object;
    }
    setProgress(31, `Worker parsing ${ext.toUpperCase()} geometry`);
    const object = await parseInWorker(mainFile, ext, active, setProgress);
    object.userData.importMaterialInfo = { workerParsed: true };
    return object;
  }

  if (ext === "obj") {
    const { creator, referencedMtl, mtlFile, objText, normalizeRGB } = await loadMtlCreator(mainFile, files, manager, active);
    if (mtlFile) setProgress(42, `Material library: ${mtlFile.name}${normalizeRGB ? " · RGB normalized" : ""}`);
    const { OBJLoader } = await loaderImports.obj();
    const loader = new OBJLoader(manager);
    if (creator) loader.setMaterials(creator);
    setProgress(62, "Parsing OBJ geometry + materials");
    const object = loader.parse(objText);
    object.userData.importMaterialInfo = {
      mtlFile: mtlFile?.name || "",
      referencedMtl,
      hasMaterialLibrary: Boolean(creator),
      workerParsed: false,
    };
    return object;
  }

  if (ext === "stl") {
    const { STLLoader } = await loaderImports.stl();
    const geometry = new STLLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"));
    geometry.computeVertexNormals?.();
    return new THREE.Mesh(geometry, makeDefaultMaterial(geometry));
  }

  if (ext === "ply") {
    const { PLYLoader } = await loaderImports.ply();
    const geometry = new PLYLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"));
    geometry.computeVertexNormals?.();
    return new THREE.Mesh(geometry, makeDefaultMaterial(geometry));
  }

  if (ext === "glb" || ext === "gltf") {
    const loader = await configureGltfLoader(manager, renderer);
    const source = ext === "glb"
      ? await createReaderTask(active, mainFile, "buffer")
      : await createReaderTask(active, mainFile, "text");
    try {
      return await new Promise((resolve, reject) => {
        loader.parse(source, "", (gltf) => resolve(gltf.scene), reject);
      });
    } finally {
      loader.userData?.draco?.dispose?.();
      loader.userData?.ktx2?.dispose?.();
    }
  }

  if (ext === "fbx") {
    const { FBXLoader } = await loaderImports.fbx();
    return new FBXLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"), "");
  }

  if (ext === "dae") {
    const { ColladaLoader } = await loaderImports.dae();
    return new ColladaLoader(manager).parse(await createReaderTask(active, mainFile, "text"), "").scene;
  }

  if (ext === "3mf") {
    const { ThreeMFLoader } = await loaderImports["3mf"]();
    return new ThreeMFLoader(manager).parse(await createReaderTask(active, mainFile, "buffer"));
  }

  if (ext === "3ds") {
    const { TDSLoader } = await loaderImports["3ds"]();
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
  if (totalBytes > 300 * 1024 * 1024) warnings.push(`Very large model bundle (${formatBytes(totalBytes)}). Camera Studio will lower viewport quality and use worker parsing where supported.`);
  else if (totalBytes > 80 * 1024 * 1024) warnings.push(`Large model bundle (${formatBytes(totalBytes)}). Browser memory use may be high.`);
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


function ensureSceneIds(root) {
  let index = 0;
  root?.traverse?.((node) => {
    if (!node.userData.sceneId) node.userData.sceneId = `scene-${node.uuid || ++index}`;
    if (node.userData.locked == null) node.userData.locked = false;
  });
}

function objectStats(node) {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  let materials = 0;
  node?.traverse?.((child) => {
    if (!child.isMesh) return;
    meshes += 1;
    const position = child.geometry?.attributes?.position;
    if (position) vertices += position.count || 0;
    triangles += child.geometry?.index
      ? Math.floor((child.geometry.index.count || 0) / 3)
      : position
        ? Math.floor((position.count || 0) / 3)
        : 0;
    materials += Array.isArray(child.material) ? child.material.length : child.material ? 1 : 0;
  });
  return { meshes, vertices, triangles, materials };
}

function buildSceneGraphNode(node) {
  const children = (node.children || [])
    .filter((child) => child.isObject3D && !child.userData?.viewportHelper)
    .map(buildSceneGraphNode);
  const ownPosition = node.isMesh ? node.geometry?.attributes?.position : null;
  const ownStats = {
    meshes: node.isMesh ? 1 : 0,
    vertices: ownPosition?.count || 0,
    triangles: node.isMesh
      ? node.geometry?.index
        ? Math.floor((node.geometry.index.count || 0) / 3)
        : ownPosition
          ? Math.floor((ownPosition.count || 0) / 3)
          : 0
      : 0,
    materials: node.isMesh ? (Array.isArray(node.material) ? node.material.length : node.material ? 1 : 0) : 0,
  };
  const stats = children.reduce((sum, child) => ({
    meshes: sum.meshes + (child.stats?.meshes || 0),
    vertices: sum.vertices + (child.stats?.vertices || 0),
    triangles: sum.triangles + (child.stats?.triangles || 0),
    materials: sum.materials + (child.stats?.materials || 0),
  }), ownStats);
  return {
    id: node.userData.sceneId || node.uuid,
    uuid: node.uuid,
    name: node.name || node.type || "Object",
    type: node.type || (node.isMesh ? "Mesh" : "Object"),
    visible: node.visible !== false,
    locked: Boolean(node.userData?.locked),
    stats,
    children,
  };
}

function collectMaterialsForSelection(objects = []) {
  const map = new Map();
  for (const object of objects) {
    object?.traverse?.((node) => {
      if (!node.isMesh) return;
      const sourceMaterial = node.userData?.originalViewportMaterial || node.material;
      const materials = Array.isArray(sourceMaterial) ? sourceMaterial : sourceMaterial ? [sourceMaterial] : [];
      materials.forEach((material, index) => {
        if (!material) return;
        const id = material.uuid || `${node.uuid}-material-${index}`;
        if (map.has(id)) return;
        const textureSlots = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "aoMap"]
          .filter((key) => material[key]?.isTexture);
        const textureDetails = textureSlots.map((slot) => {
          const texture = material[slot];
          const image = texture?.image || texture?.source?.data;
          const src = typeof image?.src === "string" && /^(blob:|data:|https?:)/i.test(image.src) ? image.src : "";
          return {
            slot,
            name: texture?.name || image?.name || baseName(image?.src || "") || "Texture",
            src,
            width: image?.width || 0,
            height: image?.height || 0,
          };
        });
        map.set(id, {
          id,
          name: material.name || `Material ${map.size + 1}`,
          type: material.type || "Material",
          color: material.color?.isColor ? `#${material.color.getHexString()}` : "#b8c0ca",
          emissive: material.emissive?.isColor ? `#${material.emissive.getHexString()}` : "#000000",
          roughness: Number.isFinite(material.roughness) ? material.roughness : null,
          metalness: Number.isFinite(material.metalness) ? material.metalness : null,
          opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
          transparent: Boolean(material.transparent),
          doubleSided: material.side === THREE.DoubleSide,
          textures: textureSlots,
          textureDetails,
        });
      });
    });
  }
  return Array.from(map.values());
}

function textureByteEstimate(texture) {
  const image = texture?.image;
  const width = image?.width || image?.videoWidth || 0;
  const height = image?.height || image?.videoHeight || 0;
  if (!width || !height) return 0;
  return width * height * 4 * 1.33;
}

function estimateGpuBytes(root) {
  const seenGeometry = new Set();
  const seenTextures = new Set();
  let geometryBytes = 0;
  let textureBytes = 0;
  root?.traverse?.((node) => {
    const geometry = node.geometry;
    if (geometry && !seenGeometry.has(geometry.uuid)) {
      seenGeometry.add(geometry.uuid);
      for (const attribute of Object.values(geometry.attributes || {})) geometryBytes += attribute?.array?.byteLength || 0;
      geometryBytes += geometry.index?.array?.byteLength || 0;
    }
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    materials.forEach((material) => {
      for (const key of Object.keys(material || {})) {
        const texture = material?.[key];
        if (texture?.isTexture && !seenTextures.has(texture.uuid)) {
          seenTextures.add(texture.uuid);
          textureBytes += textureByteEstimate(texture);
        }
      }
    });
  });
  return { geometryBytes, textureBytes, totalBytes: geometryBytes + textureBytes };
}

function qualityForScene(stats, totalBytes, requested = "auto") {
  if (["low", "medium", "high", "ultra"].includes(requested)) return requested;
  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);
  if (totalBytes > 320 * 1024 * 1024 || stats.triangleCount > 3_000_000 || memory <= 4 || cores <= 4) return "low";
  if (totalBytes > 180 * 1024 * 1024 || stats.triangleCount > 1_500_000 || memory <= 6) return "medium";
  if (stats.triangleCount > 650_000 || totalBytes > 90 * 1024 * 1024) return "high";
  return "ultra";
}

function qualityPixelRatio(quality) {
  const dpr = window.devicePixelRatio || 1;
  if (quality === "low") return Math.min(dpr, 1);
  if (quality === "medium") return Math.min(dpr, 1.25);
  if (quality === "high") return Math.min(dpr, 1.6);
  return Math.min(dpr, 2);
}

function qualityIndex(quality) {
  return ["low", "medium", "high", "ultra"].indexOf(quality);
}

function kelvinToColor(kelvin = 6500) {
  const temperature = THREE.MathUtils.clamp(Number(kelvin) || 6500, 1000, 40000) / 100;
  let red;
  let green;
  let blue;
  if (temperature <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temperature) - 161.1195681661;
    blue = temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temperature - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temperature - 60, -0.0755148492);
    blue = 255;
  }
  return new THREE.Color(
    THREE.MathUtils.clamp(red, 0, 255) / 255,
    THREE.MathUtils.clamp(green, 0, 255) / 255,
    THREE.MathUtils.clamp(blue, 0, 255) / 255,
  );
}

function findBySceneId(root, id) {
  let result = null;
  root?.traverse?.((node) => {
    if (!result && (node.userData?.sceneId === id || node.uuid === id)) result = node;
  });
  return result;
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
  selectedObjectIds = [],
  lightingConfig = {},
  customEnvironmentFile = null,
  qualityMode = "auto",
  onModelInfo,
  onLoadState,
  onSelectionChange,
  onSceneGraphChange,
  onMaterialInfo,
  onPerformanceInfo,
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
  const selectionHelperRef = useRef([]);
  const selectedObjectsRef = useRef([]);
  const activeLoadRef = useRef(null);
  const lightsRef = useRef({ hemisphere: null, ambient: null, key: null, fill: null, rim: null });
  const environmentTextureRef = useRef(null);
  const qualityRef = useRef("high");
  const autoQualityCeilingRef = useRef("ultra");
  const adaptiveQualityRef = useRef({ lowTicks: 0, highTicks: 0, lastChange: 0 });
  const frameMetricsRef = useRef({ lastTime: performance.now(), frames: 0, fps: 0, lastReport: 0 });
  const contextLostRef = useRef(false);
  const gpuNameRef = useRef("WebGL GPU");
  const gpuEstimateRef = useRef({ geometryBytes: 0, textureBytes: 0, totalBytes: 0 });
  const objectUrlsRef = useRef([]);
  const animationRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerDownRef = useRef(null);
  const syncingCameraRef = useRef(false);
  const projectionModeRef = useRef(projectionMode);
  projectionModeRef.current = projectionMode;
  const mainFileRef = useRef(mainFile);
  mainFileRef.current = mainFile;
  const qualityModeRef = useRef(qualityMode);
  qualityModeRef.current = qualityMode;
  const lightingConfigRef = useRef(lightingConfig);
  lightingConfigRef.current = lightingConfig;
  const [status, setStatus] = useState("idle");
  const [progress, setProgressState] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [selectedNames, setSelectedNames] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);

  const refreshSelectionHelpers = (objects = selectedObjectsRef.current) => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const helper of selectionHelperRef.current || []) {
      scene.remove(helper);
      helper.geometry?.dispose?.();
      disposeMaterial(helper.material);
    }
    selectionHelperRef.current = [];
    for (const object of objects) {
      if (!object?.isObject3D) continue;
      const helper = new THREE.BoxHelper(object, 0x4ea1ff);
      helper.userData.viewportHelper = true;
      selectionHelperRef.current.push(helper);
      scene.add(helper);
    }
  };

  const refreshGpuEstimate = () => {
    gpuEstimateRef.current = estimateGpuBytes(modelRef.current);
    return gpuEstimateRef.current;
  };

  const emitSceneGraph = () => {
    const root = modelRef.current;
    if (!root) {
      onSceneGraphChange?.(null);
      return;
    }
    ensureSceneIds(root);
    onSceneGraphChange?.({
      id: "scene-root",
      name: "Scene",
      type: "Scene",
      children: [
        { id: "camera-node", name: projectionModeRef.current === "orthographic" ? "Camera (Orthographic)" : "Camera (Perspective)", type: "Camera", visible: true, locked: false, stats: {}, children: [] },
        { id: "lights-node", name: "Lights", type: "Lights", visible: true, locked: false, stats: {}, children: [] },
        buildSceneGraphNode(root),
      ],
    });
  };

  const emitMaterialInfo = () => {
    onMaterialInfo?.({
      selectedIds: selectedObjectsRef.current.map((object) => object.userData?.sceneId || object.uuid),
      materials: collectMaterialsForSelection(selectedObjectsRef.current.length ? selectedObjectsRef.current : [modelRef.current].filter(Boolean)),
    });
  };

  const selectObjectsByIds = (ids = [], additive = false) => {
    const root = modelRef.current;
    if (!root) return [];
    const next = additive ? [...selectedObjectsRef.current] : [];
    const seen = new Set(next.map((object) => object.userData?.sceneId || object.uuid));
    for (const id of ids) {
      const object = findBySceneId(root, id);
      if (!object || object.userData?.locked) continue;
      const objectId = object.userData?.sceneId || object.uuid;
      if (!seen.has(objectId)) {
        next.push(object);
        seen.add(objectId);
      }
    }
    selectedObjectsRef.current = next;
    setSelectedNames(next.map((object) => object.name || "Object"));
    refreshSelectionHelpers(next);
    const payload = next.map((object) => ({
      id: object.userData?.sceneId || object.uuid,
      uuid: object.uuid,
      name: object.name || "Object",
      type: object.type || "Object",
      stats: objectStats(object),
    }));
    onSelectionChange?.(payload);
    emitMaterialInfo();
    return payload;
  };

  const addGeneratedObject = (object, options = {}) => {
    const root = modelRef.current;
    if (!root || !object) return null;
    object.name = String(options.name || object.name || "Generated Object").slice(0, 120);
    object.userData.generatedByExtension = true;
    object.traverse?.((node) => {
      if (node.isMesh && !node.userData.originalViewportMaterial) node.userData.originalViewportMaterial = node.material;
    });
    root.add(object);
    ensureSceneIds(object);
    if (shadingMode !== "material") applyShading(object, shadingMode);
    refreshGpuEstimate();
    emitSceneGraph();
    const id = object.userData?.sceneId || object.uuid;
    selectObjectsByIds([id], false);
    return { id, name: object.name, type: object.type || "Object" };
  };

  const proceduralNoise = (x, z, seed = 1) => {
    const a = Math.sin((x + seed * 0.13) * 1.71) * 0.52;
    const b = Math.cos((z - seed * 0.17) * 2.19) * 0.31;
    const c = Math.sin((x + z + seed) * 0.87) * 0.17;
    return a + b + c;
  };

  const createGeneratedObject = (kind, rawOptions = {}) => {
    const options = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
    const radius = Math.max(modelRadiusRef.current || 1, 0.25);
    const standardMaterial = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...extra });
    let object = null;

    if (kind === "terrain") {
      const size = THREE.MathUtils.clamp(Number(options.size) || radius * 4, 1, 100);
      const segments = Math.round(THREE.MathUtils.clamp(Number(options.segments) || 64, 4, 180));
      const height = THREE.MathUtils.clamp(Number(options.height) || size * 0.12, 0, size);
      const seed = Number(options.seed) || 1;
      const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const edge = Math.min(1, Math.max(0, 1 - Math.max(Math.abs(x), Math.abs(z)) / (size * 0.5)));
        position.setY(index, proceduralNoise(x / Math.max(size * 0.15, 0.001), z / Math.max(size * 0.15, 0.001), seed) * height * (0.45 + edge * 0.55));
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, standardMaterial(options.color || 0x60775d));
      object.position.y = -radius * 0.6;
    } else if (kind === "tree") {
      const height = THREE.MathUtils.clamp(Number(options.height) || radius * 2.4, 0.5, 40);
      const crownRadius = THREE.MathUtils.clamp(Number(options.crownRadius) || height * 0.32, 0.2, height);
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.07, height * 0.1, height * 0.58, 12), standardMaterial(0x6b4930));
      trunk.name = "Trunk";
      trunk.position.y = height * 0.29;
      group.add(trunk);
      const crownMaterial = standardMaterial(options.crownColor || 0x54724c);
      const crownY = height * 0.72;
      [[0,0,0,1],[-.42,.04,.12,.72],[.38,.08,-.12,.76],[.08,.24,.24,.68]].forEach(([x,y,z,scale], index) => {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(crownRadius * scale, 2), crownMaterial.clone());
        crown.name = `Crown ${index + 1}`;
        crown.position.set(x * crownRadius, crownY + y * height, z * crownRadius);
        group.add(crown);
      });
      group.position.set(radius * 1.45, -radius * 0.6, 0);
      object = group;
    } else if (kind === "cloud") {
      const puffs = Math.round(THREE.MathUtils.clamp(Number(options.puffs) || 10, 3, 40));
      const cloudRadius = THREE.MathUtils.clamp(Number(options.radius) || radius * 1.2, 0.4, 20);
      const seed = Number(options.seed) || 1;
      const group = new THREE.Group();
      for (let i = 0; i < puffs; i += 1) {
        const t = i + seed * 0.37;
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(cloudRadius * (0.26 + (Math.sin(t * 1.7) + 1) * 0.08), 1), standardMaterial(0xe6eaee, { roughness: 1 }));
        puff.name = `Cloud Puff ${i + 1}`;
        puff.position.set(Math.sin(t * 2.13) * cloudRadius * 0.75, Math.abs(Math.cos(t * 1.41)) * cloudRadius * 0.3, Math.cos(t * 1.89) * cloudRadius * 0.42);
        group.add(puff);
      }
      group.position.set(-radius * 1.4, radius * 1.8, 0);
      object = group;
    } else if (kind === "ivy") {
      const turns = THREE.MathUtils.clamp(Number(options.turns) || 5, 1, 20);
      const ivyRadius = THREE.MathUtils.clamp(Number(options.radius) || radius * 0.85, 0.1, 20);
      const height = THREE.MathUtils.clamp(Number(options.height) || radius * 2.2, 0.4, 40);
      const leaves = Math.round(THREE.MathUtils.clamp(Number(options.leaves) || 28, 4, 100));
      const points = [];
      for (let i = 0; i <= leaves; i += 1) {
        const t = i / leaves;
        const angle = t * Math.PI * 2 * turns;
        points.push(new THREE.Vector3(Math.cos(angle) * ivyRadius, -radius * 0.45 + t * height, Math.sin(angle) * ivyRadius));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const group = new THREE.Group();
      const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, leaves * 2, Math.max(ivyRadius * 0.025, 0.01), 6, false), standardMaterial(0x395a35));
      vine.name = "Ivy Vine";
      group.add(vine);
      const leafGeometry = new THREE.SphereGeometry(Math.max(ivyRadius * 0.08, 0.025), 8, 5);
      for (let i = 0; i < leaves; i += 2) {
        const leaf = new THREE.Mesh(leafGeometry.clone(), standardMaterial(0x507b45));
        leaf.name = `Ivy Leaf ${i / 2 + 1}`;
        leaf.position.copy(points[i]);
        leaf.scale.set(1.6, 0.45, 0.9);
        group.add(leaf);
      }
      object = group;
    } else if (kind === "metaRig") {
      const height = THREE.MathUtils.clamp(Number(options.height) || radius * 2, 0.8, 20);
      const group = new THREE.Group();
      const hips = new THREE.Bone(); hips.name = "hips"; hips.position.y = height * 0.48;
      const spine = new THREE.Bone(); spine.name = "spine"; spine.position.y = height * 0.18;
      const chest = new THREE.Bone(); chest.name = "chest"; chest.position.y = height * 0.16;
      const neck = new THREE.Bone(); neck.name = "neck"; neck.position.y = height * 0.13;
      const head = new THREE.Bone(); head.name = "head"; head.position.y = height * 0.11;
      hips.add(spine); spine.add(chest); chest.add(neck); neck.add(head);
      const addLimb = (parent, name, x, y, childY) => {
        const upper = new THREE.Bone(); upper.name = `${name}_upper`; upper.position.set(x, y, 0);
        const lower = new THREE.Bone(); lower.name = `${name}_lower`; lower.position.set(0, childY, 0);
        upper.add(lower); parent.add(upper);
      };
      addLimb(chest, "arm.L", height * 0.15, height * 0.07, -height * 0.18);
      addLimb(chest, "arm.R", -height * 0.15, height * 0.07, -height * 0.18);
      addLimb(hips, "leg.L", height * 0.09, 0, -height * 0.34);
      addLimb(hips, "leg.R", -height * 0.09, 0, -height * 0.34);
      group.add(hips);
      const helper = new THREE.SkeletonHelper(hips);
      helper.name = "Meta-Rig Display";
      helper.material.depthTest = false;
      helper.renderOrder = 10;
      group.add(helper);
      object = group;
    } else {
      const primitive = String(options.type || kind || "cube").toLowerCase();
      const size = THREE.MathUtils.clamp(Number(options.size) || radius * 0.6, 0.05, 50);
      let geometry;
      if (primitive === "sphere") geometry = new THREE.SphereGeometry(size * 0.5, 32, 20);
      else if (primitive === "cylinder") geometry = new THREE.CylinderGeometry(size * 0.35, size * 0.35, size, 24);
      else if (primitive === "cone") geometry = new THREE.ConeGeometry(size * 0.45, size, 24);
      else geometry = new THREE.BoxGeometry(size, size, size);
      object = new THREE.Mesh(geometry, standardMaterial(options.color || 0x6d89a8));
      object.position.set(radius * 1.25, 0, 0);
    }

    return addGeneratedObject(object, options);
  };

  const fractureObjects = (ids = [], rawOptions = {}) => {
    const root = modelRef.current;
    if (!root) return null;
    const objects = (ids.length ? ids : selectedObjectsRef.current.map((item) => item.userData?.sceneId || item.uuid)).map((id) => findBySceneId(root, id)).filter(Boolean);
    if (!objects.length) return null;
    const box = new THREE.Box3();
    objects.forEach((object) => box.expandByObject(object));
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const pieces = Math.round(THREE.MathUtils.clamp(Number(rawOptions.pieces) || 12, 4, 64));
    const spread = THREE.MathUtils.clamp(Number(rawOptions.spread) || 0.08, 0, 1);
    const group = new THREE.Group();
    group.position.copy(center);
    const cols = Math.max(2, Math.ceil(Math.cbrt(pieces)));
    const shardSize = new THREE.Vector3(size.x / cols, size.y / cols, size.z / cols);
    for (let index = 0; index < pieces; index += 1) {
      const x = index % cols;
      const y = Math.floor(index / cols) % cols;
      const z = Math.floor(index / (cols * cols));
      const geometry = new THREE.BoxGeometry(Math.max(shardSize.x * 0.86, 0.01), Math.max(shardSize.y * 0.86, 0.01), Math.max(shardSize.z * 0.86, 0.01));
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((index * 0.07) % 1, 0.28, 0.52), roughness: 0.72, transparent: true, opacity: 0.78 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Fracture Piece ${index + 1}`;
      mesh.position.set((x - (cols - 1) / 2) * shardSize.x, (y - (cols - 1) / 2) * shardSize.y, (z - (cols - 1) / 2) * shardSize.z);
      mesh.position.multiplyScalar(1 + spread);
      group.add(mesh);
    }
    return addGeneratedObject(group, { name: `Fracture Preview (${pieces})` });
  };

  const analyzeFor3DPrint = (ids = []) => {
    const root = modelRef.current;
    if (!root) return { ok: false, message: "No model is loaded." };
    const objects = (ids.length ? ids.map((id) => findBySceneId(root, id)) : selectedObjectsRef.current).filter(Boolean);
    const targets = objects.length ? objects : [root];
    const box = new THREE.Box3();
    let triangles = 0;
    let vertices = 0;
    let openEdges = 0;
    let analyzedEdges = 0;
    let skippedTopology = false;
    const seenGeometries = new Set();

    targets.forEach((target) => {
      box.expandByObject(target);
      target.traverse?.((node) => {
        if (!node.isMesh || !node.geometry || seenGeometries.has(node.geometry)) return;
        seenGeometries.add(node.geometry);
        const geometry = node.geometry;
        const position = geometry.attributes?.position;
        if (!position) return;
        vertices += position.count;
        const triCount = geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(position.count / 3);
        triangles += triCount;
        if (triCount > 180000) { skippedTopology = true; return; }
        const edges = new Map();
        const vertexKey = (index) => {
          if (geometry.index) return String(index);
          const x = Math.round(position.getX(index) * 100000);
          const y = Math.round(position.getY(index) * 100000);
          const z = Math.round(position.getZ(index) * 100000);
          return `${x},${y},${z}`;
        };
        const addEdge = (a, b) => {
          const ka = vertexKey(a); const kb = vertexKey(b);
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          edges.set(key, (edges.get(key) || 0) + 1);
        };
        const indexArray = geometry.index?.array;
        for (let tri = 0; tri < triCount; tri += 1) {
          const a = indexArray ? indexArray[tri * 3] : tri * 3;
          const b = indexArray ? indexArray[tri * 3 + 1] : tri * 3 + 1;
          const c = indexArray ? indexArray[tri * 3 + 2] : tri * 3 + 2;
          addEdge(a, b); addEdge(b, c); addEdge(c, a);
        }
        analyzedEdges += edges.size;
        for (const count of edges.values()) if (count === 1) openEdges += 1;
      });
    });

    const dimensions = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    return {
      ok: true,
      objects: targets.length,
      meshes: seenGeometries.size,
      triangles,
      vertices,
      dimensions: { x: dimensions.x, y: dimensions.y, z: dimensions.z },
      openEdges: skippedTopology ? null : openEdges,
      analyzedEdges,
      topologySkipped: skippedTopology,
      watertight: skippedTopology ? null : openEdges === 0,
    };
  };

  useImperativeHandle(forwardedRef, () => ({
    async captureScreenshot(options = {}) {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = getActiveCamera();
      const host = hostRef.current;
      if (!renderer || !scene || !camera || !host) throw new Error("3D viewport is not ready.");

      const format = ["image/jpeg", "image/webp", "image/png"].includes(options.mimeType) ? options.mimeType : "image/png";
      const quality = Number.isFinite(options.quality) ? options.quality : 0.94;
      const currentSize = new THREE.Vector2();
      renderer.getSize(currentSize);

      const finalScale = Math.max(0.25, Math.min(4, Number(options.scale) || 1));
      const finalWidth = Math.max(64, Math.min(8192, Math.round(options.width || currentSize.x * finalScale)));
      const finalHeight = Math.max(64, Math.min(8192, Math.round(options.height || currentSize.y * finalScale)));
      const requestedSupersampling = Math.max(1, Math.min(4, Number(options.supersampling) || 1));
      const maxTexture = Math.max(2048, Number(renderer.capabilities?.maxTextureSize) || 8192);
      const maxSampleScale = Math.max(1, Math.min(requestedSupersampling, maxTexture / finalWidth, maxTexture / finalHeight));
      const renderWidth = Math.max(64, Math.min(maxTexture, Math.round(finalWidth * maxSampleScale)));
      const renderHeight = Math.max(64, Math.min(maxTexture, Math.round(finalHeight * maxSampleScale)));

      const oldBackground = scene.background;
      const oldAlpha = renderer.getClearAlpha();
      const oldTarget = renderer.getRenderTarget();
      const oldToneMapping = renderer.toneMapping;
      const oldExposure = renderer.toneMappingExposure;
      const oldShadowType = renderer.shadowMap.type;
      const oldShadowEnabled = renderer.shadowMap.enabled;
      const ground = groundRef.current;
      const oldGroundReceiveShadow = ground?.receiveShadow;
      const keyLight = lightsRef.current?.key;
      const oldKeyCastShadow = keyLight?.castShadow;
      const oldShadowMapSize = keyLight?.shadow?.mapSize ? { x: keyLight.shadow.mapSize.x, y: keyLight.shadow.mapSize.y } : null;
      const helpers = selectionHelperRef.current || [];
      const helperVisibility = helpers.map((helper) => helper.visible);
      helpers.forEach((helper) => { helper.visible = false; });

      const oldProjection = camera.isPerspectiveCamera
        ? { aspect: camera.aspect }
        : { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom };
      const captureAspect = finalWidth / Math.max(finalHeight, 1);
      if (camera.isPerspectiveCamera) camera.aspect = captureAspect;
      else if (camera.isOrthographicCamera) {
        const halfHeight = Math.max((camera.top - camera.bottom) * 0.5, 0.001);
        camera.left = -halfHeight * captureAspect;
        camera.right = halfHeight * captureAspect;
      }
      camera.updateProjectionMatrix();

      const toneMappings = {
        none: THREE.NoToneMapping,
        linear: THREE.LinearToneMapping,
        reinhard: THREE.ReinhardToneMapping,
        cineon: THREE.CineonToneMapping,
        aces: THREE.ACESFilmicToneMapping,
        neutral: THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping,
      };
      renderer.toneMapping = toneMappings[String(options.toneMapping || "aces").toLowerCase()] ?? THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = Math.max(0.05, Math.min(8, Number(options.exposure) || 1));

      const shadowQuality = String(options.shadowQuality || "high").toLowerCase();
      renderer.shadowMap.enabled = options.shadows !== false;
      renderer.shadowMap.type = shadowQuality === "draft"
        ? THREE.BasicShadowMap
        : shadowQuality === "medium"
          ? THREE.PCFShadowMap
          : THREE.PCFSoftShadowMap;
      const shadowSize = shadowQuality === "ultra" ? 4096 : shadowQuality === "high" ? 2048 : shadowQuality === "medium" ? 1024 : 512;
      if (keyLight?.shadow?.mapSize) {
        keyLight.shadow.mapSize.set(shadowSize, shadowSize);
        keyLight.shadow.map?.dispose?.();
        keyLight.shadow.map = null;
      }
      if (keyLight) keyLight.castShadow = options.shadows !== false;
      if (ground) ground.receiveShadow = options.contactShadows !== false && options.shadows !== false;

      const forceTransparentScene = Boolean(options.transparent || options.backgroundImageFile);
      if (forceTransparentScene) {
        scene.background = null;
        renderer.setClearAlpha(0);
      } else if (options.backgroundHdri && environmentTextureRef.current) {
        scene.background = environmentTextureRef.current;
        renderer.setClearAlpha(1);
      } else if (options.backgroundColor) {
        try { scene.background = new THREE.Color(options.backgroundColor); } catch { /* keep studio background */ }
        renderer.setClearAlpha(1);
      }

      const renderTarget = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
      if (renderer.capabilities?.isWebGL2 && options.antiAlias !== false) {
        renderTarget.samples = Math.min(4, Number(renderer.capabilities?.maxSamples) || 4);
      }

      let composer = null;
      let postProcessed = false;
      const postPasses = [];
      try {
        let readTarget = renderTarget;
        if ((options.ambientOcclusion || options.bloom) && !forceTransparentScene) {
          try {
            const [{ EffectComposer }, { RenderPass }, { SSAOPass }, { UnrealBloomPass }] = await Promise.all([
              import("three/addons/postprocessing/EffectComposer.js"),
              import("three/addons/postprocessing/RenderPass.js"),
              import("three/addons/postprocessing/SSAOPass.js"),
              import("three/addons/postprocessing/UnrealBloomPass.js"),
            ]);
            composer = new EffectComposer(renderer, renderTarget);
            composer.renderToScreen = false;
            composer.setPixelRatio(1);
            composer.setSize(renderWidth, renderHeight);
            const renderPass = new RenderPass(scene, camera);
            composer.addPass(renderPass);
            postPasses.push(renderPass);
            if (options.ambientOcclusion) {
              const aoStrength = Math.max(0.05, Math.min(1, Number(options.ambientOcclusionStrength) || 0.35));
              const ssaoPass = new SSAOPass(scene, camera, renderWidth, renderHeight);
              ssaoPass.kernelRadius = Math.max(2, Math.round(6 + aoStrength * 22));
              ssaoPass.minDistance = 0.0025;
              ssaoPass.maxDistance = 0.12 + aoStrength * 0.2;
              composer.addPass(ssaoPass);
              postPasses.push(ssaoPass);
            }
            if (options.bloom && !postProcessed) {
              const bloomStrength = Math.max(0.05, Math.min(1.5, Number(options.bloomStrength) || 0.35));
              const bloomPass = new UnrealBloomPass(new THREE.Vector2(renderWidth, renderHeight), bloomStrength, 0.35, 0.88);
              composer.addPass(bloomPass);
              postPasses.push(bloomPass);
            }
            if (renderer.capabilities?.isWebGL2 && options.antiAlias !== false) {
              const samples = Math.min(4, Number(renderer.capabilities?.maxSamples) || 4);
              if (composer.renderTarget1) composer.renderTarget1.samples = samples;
              if (composer.renderTarget2) composer.renderTarget2.samples = samples;
            }
            composer.render();
            readTarget = composer.readBuffer;
            postProcessed = true;
          } catch {
            renderer.setRenderTarget(renderTarget);
            renderer.clear(true, true, true);
            renderer.render(scene, camera);
            readTarget = renderTarget;
          }
        } else {
          renderer.setRenderTarget(renderTarget);
          renderer.clear(true, true, true);
          renderer.render(scene, camera);
        }
        const pixels = new Uint8Array(renderWidth * renderHeight * 4);
        renderer.readRenderTargetPixels(readTarget, 0, 0, renderWidth, renderHeight, pixels);

        const rowBytes = renderWidth * 4;
        const flipped = new Uint8ClampedArray(pixels.length);
        for (let y = 0; y < renderHeight; y += 1) {
          const sourceOffset = (renderHeight - 1 - y) * rowBytes;
          flipped.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), y * rowBytes);
        }

        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = renderWidth;
        sourceCanvas.height = renderHeight;
        const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
        if (!sourceContext) throw new Error("2D export canvas is unavailable.");
        sourceContext.putImageData(new ImageData(flipped, renderWidth, renderHeight), 0, 0);

        const canvas = document.createElement("canvas");
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("2D export canvas is unavailable.");

        if (options.backgroundImageFile) {
          try {
            const bitmap = await createImageBitmap(options.backgroundImageFile);
            const imageRatio = bitmap.width / Math.max(bitmap.height, 1);
            const canvasRatio = finalWidth / Math.max(finalHeight, 1);
            let drawWidth = finalWidth;
            let drawHeight = finalHeight;
            let drawX = 0;
            let drawY = 0;
            if (imageRatio > canvasRatio) {
              drawHeight = finalHeight;
              drawWidth = finalHeight * imageRatio;
              drawX = (finalWidth - drawWidth) * 0.5;
            } else {
              drawWidth = finalWidth;
              drawHeight = finalWidth / imageRatio;
              drawY = (finalHeight - drawHeight) * 0.5;
            }
            context.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);
            bitmap.close?.();
          } catch {
            context.fillStyle = options.backgroundColor || "#202124";
            context.fillRect(0, 0, finalWidth, finalHeight);
          }
        } else if (!options.transparent && options.backgroundColor) {
          context.fillStyle = options.backgroundColor;
          context.fillRect(0, 0, finalWidth, finalHeight);
        }

        const aoStrength = options.ambientOcclusion && !postProcessed ? Math.max(0, Math.min(1, Number(options.ambientOcclusionStrength) || 0.35)) : 0;
        if (aoStrength > 0) context.filter = `contrast(${1 + aoStrength * 0.12}) brightness(${1 - aoStrength * 0.025})`;
        context.drawImage(sourceCanvas, 0, 0, finalWidth, finalHeight);
        context.filter = "none";

        if (options.bloom) {
          const bloomStrength = Math.max(0.05, Math.min(1.5, Number(options.bloomStrength) || 0.35));
          context.save();
          context.globalCompositeOperation = "screen";
          context.globalAlpha = Math.min(0.5, 0.12 + bloomStrength * 0.22);
          context.filter = `blur(${Math.max(2, Math.round(Math.min(finalWidth, finalHeight) * 0.006))}px) brightness(${1.1 + bloomStrength * 0.4})`;
          context.drawImage(sourceCanvas, 0, 0, finalWidth, finalHeight);
          context.restore();
        }

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode the viewport image.")), format, quality);
        });
        return blob;
      } finally {
        postPasses.forEach((pass) => { try { pass.dispose?.(); } catch {} });
        try { composer?.dispose?.(); } catch {}
        renderer.setRenderTarget(oldTarget);
        renderTarget.dispose();
        scene.background = oldBackground;
        renderer.setClearAlpha(oldAlpha);
        renderer.toneMapping = oldToneMapping;
        renderer.toneMappingExposure = oldExposure;
        renderer.shadowMap.type = oldShadowType;
        renderer.shadowMap.enabled = oldShadowEnabled;
        if (ground && oldGroundReceiveShadow != null) ground.receiveShadow = oldGroundReceiveShadow;
        if (keyLight && oldKeyCastShadow != null) keyLight.castShadow = oldKeyCastShadow;
        if (keyLight?.shadow?.mapSize && oldShadowMapSize) {
          keyLight.shadow.mapSize.set(oldShadowMapSize.x, oldShadowMapSize.y);
          keyLight.shadow.map?.dispose?.();
          keyLight.shadow.map = null;
        }
        if (camera.isPerspectiveCamera) camera.aspect = oldProjection.aspect;
        else if (camera.isOrthographicCamera) {
          camera.left = oldProjection.left;
          camera.right = oldProjection.right;
          camera.top = oldProjection.top;
          camera.bottom = oldProjection.bottom;
        }
        camera.updateProjectionMatrix();
        helpers.forEach((helper, index) => { helper.visible = helperVisibility[index] !== false; });
        renderer.render(scene, camera);
      }
    },
    getSelectedObject() {
      return selectedObjectsRef.current.map((object) => object.name || "Object").join(", ");
    },
    getSceneSnapshot() {
      const root = modelRef.current;
      return root ? buildSceneGraphNode(root) : null;
    },
    getPerformanceSnapshot() {
      const renderer = rendererRef.current;
      const memory = gpuEstimateRef.current;
      return {
        quality: qualityRef.current,
        fps: frameMetricsRef.current.fps,
        calls: renderer?.info?.render?.calls || 0,
        triangles: renderer?.info?.render?.triangles || 0,
        geometries: renderer?.info?.memory?.geometries || 0,
        textures: renderer?.info?.memory?.textures || 0,
        estimatedGpuBytes: memory.totalBytes,
        gpuName: gpuNameRef.current,
      };
    },
    selectObjects(ids = [], additive = false) {
      return selectObjectsByIds(ids, additive);
    },
    renameObject(id, name) {
      const object = findBySceneId(modelRef.current, id);
      if (!object || !String(name || "").trim()) return false;
      object.name = String(name).trim().slice(0, 120);
      emitSceneGraph();
      return true;
    },
    setObjectVisibility(id, visible) {
      const object = findBySceneId(modelRef.current, id);
      if (!object) return false;
      object.visible = Boolean(visible);
      emitSceneGraph();
      return true;
    },
    setObjectLocked(id, locked) {
      const object = findBySceneId(modelRef.current, id);
      if (!object) return false;
      object.userData.locked = Boolean(locked);
      emitSceneGraph();
      return true;
    },
    duplicateObjects(ids = []) {
      const root = modelRef.current;
      if (!root) return [];
      const created = [];
      ids.forEach((id) => {
        const object = findBySceneId(root, id);
        if (!object || object === root || !object.parent) return;
        const clone = object.clone(true);
        clone.name = `${object.name || "Object"} Copy`;
        clone.position.x += Math.max(modelRadiusRef.current * 0.06, 0.05);
        const sourceNodes = [];
        const cloneNodes = [];
        object.traverse((node) => sourceNodes.push(node));
        clone.traverse((node) => cloneNodes.push(node));
        cloneNodes.forEach((node, nodeIndex) => {
          delete node.userData.sceneId;
          if (!node.isMesh) return;
          const sourceNode = sourceNodes[nodeIndex];
          if (sourceNode?.geometry?.clone) node.geometry = sourceNode.geometry.clone();
          const sourceMaterial = sourceNode?.userData?.originalViewportMaterial || sourceNode?.material || node.material;
          if (Array.isArray(sourceMaterial)) node.material = sourceMaterial.map((material) => material?.clone?.() || material);
          else if (sourceMaterial?.clone) node.material = sourceMaterial.clone();
          else node.material = sourceMaterial;
          node.userData.generatedViewportMaterial = null;
          node.userData.originalViewportMaterial = node.material;
        });
        ensureSceneIds(clone);
        object.parent.add(clone);
        if (shadingMode !== "material") applyShading(clone, shadingMode);
        created.push(clone.userData.sceneId || clone.uuid);
      });
      refreshGpuEstimate();
      emitSceneGraph();
      selectObjectsByIds(created, false);
      return created;
    },
    deleteObjects(ids = []) {
      const root = modelRef.current;
      if (!root) return false;
      const deleting = new Set(ids);
      ids.forEach((id) => {
        const object = findBySceneId(root, id);
        if (!object || object === root || !object.parent) return;
        object.parent.remove(object);
        disposeDetachedObject(object, root);
      });
      const remaining = selectedObjectsRef.current.filter((object) => !deleting.has(object.userData?.sceneId || object.uuid));
      selectObjectsByIds(remaining.map((object) => object.userData?.sceneId || object.uuid), false);
      refreshGpuEstimate();
      emitSceneGraph();
      return true;
    },
    isolateObjects(ids = []) {
      const root = modelRef.current;
      if (!root) return false;
      const keep = new Set(ids);
      root.traverse((node) => {
        if (!node.isMesh) return;
        const id = node.userData?.sceneId || node.uuid;
        node.visible = keep.size ? keep.has(id) || ids.some((selectedId) => {
          let parent = node.parent;
          while (parent && parent !== root.parent) {
            if ((parent.userData?.sceneId || parent.uuid) === selectedId) return true;
            parent = parent.parent;
          }
          return false;
        }) : true;
      });
      emitSceneGraph();
      return true;
    },
    showAllObjects() {
      modelRef.current?.traverse?.((node) => { if (node.isMesh) node.visible = true; });
      emitSceneGraph();
    },
    parentObjects(childIds = [], parentId = null) {
      const root = modelRef.current;
      if (!root) return false;
      const parent = parentId ? findBySceneId(root, parentId) : root;
      if (!parent) return false;
      childIds.forEach((id) => {
        const child = findBySceneId(root, id);
        if (!child || child === root || child === parent || child.parent === parent) return;
        if (child.getObjectById?.(parent.id)) return;
        parent.attach(child);
      });
      emitSceneGraph();
      return true;
    },
    frameSelection(ids = []) {
      const root = modelRef.current;
      const controls = controlsRef.current;
      const camera = getActiveCamera();
      if (!root || !controls || !camera) return false;
      const objects = (ids.length ? ids.map((id) => findBySceneId(root, id)) : selectedObjectsRef.current).filter(Boolean);
      if (!objects.length) return false;
      const box = new THREE.Box3();
      objects.forEach((object) => box.expandByObject(object));
      if (box.isEmpty()) return false;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.length() * 0.5, 0.1);
      const direction = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, radius * 3.2);
      if (camera.isOrthographicCamera) camera.zoom = Math.max(0.1, 1.7 / radius);
      camera.updateProjectionMatrix();
      controls.update();
      return true;
    },
    updateMaterial(materialId, patch = {}) {
      const root = modelRef.current;
      if (!root) return false;
      let changed = false;
      const visited = new Set();
      root.traverse((node) => {
        if (!node.isMesh) return;
        const sourceMaterial = node.userData?.originalViewportMaterial || node.material;
        const materials = Array.isArray(sourceMaterial) ? sourceMaterial : sourceMaterial ? [sourceMaterial] : [];
        materials.forEach((material) => {
          if (!material || visited.has(material) || material.uuid !== materialId) return;
          visited.add(material);
          if (patch.color && material.color?.isColor) material.color.set(patch.color);
          if (patch.emissive && material.emissive?.isColor) material.emissive.set(patch.emissive);
          if (patch.roughness != null && "roughness" in material) material.roughness = THREE.MathUtils.clamp(Number(patch.roughness), 0, 1);
          if (patch.metalness != null && "metalness" in material) material.metalness = THREE.MathUtils.clamp(Number(patch.metalness), 0, 1);
          if (patch.opacity != null) {
            material.opacity = THREE.MathUtils.clamp(Number(patch.opacity), 0, 1);
            material.transparent = material.opacity < 0.999;
          }
          if (patch.doubleSided != null) material.side = patch.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
          material.needsUpdate = true;
          changed = true;
        });
      });
      if (changed) emitMaterialInfo();
      return changed;
    },
    async setMaterialTexture(materialId, file, slot = "map") {
      if (!file) return false;
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      const ext = extensionOf(file.name);
      let texture;
      if (ext === "tga") {
        const { TGALoader } = await loaderImports.tga();
        texture = await new TGALoader().loadAsync(url);
      } else if (ext === "dds") {
        const { DDSLoader } = await loaderImports.dds();
        texture = await new DDSLoader().loadAsync(url);
      } else if (ext === "ktx2") {
        const { KTX2Loader } = await loaderImports.ktx2();
        const loader = new KTX2Loader().setTranscoderPath(`${LOCAL_DECODER_ROOT}/basis/`);
        if (rendererRef.current) loader.detectSupport(rendererRef.current);
        try { texture = await loader.loadAsync(url); } finally { loader.dispose?.(); }
      } else {
        texture = await new THREE.TextureLoader().loadAsync(url);
      }
      texture.colorSpace = slot === "map" || slot === "emissiveMap" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.flipY = ["glb", "gltf"].includes(extensionOf(mainFileRef.current?.name)) ? false : texture.flipY;
      texture.needsUpdate = true;
      let changed = false;
      const visited = new Set();
      modelRef.current?.traverse?.((node) => {
        if (!node.isMesh) return;
        const sourceMaterial = node.userData?.originalViewportMaterial || node.material;
        const materials = Array.isArray(sourceMaterial) ? sourceMaterial : sourceMaterial ? [sourceMaterial] : [];
        materials.forEach((material) => {
          if (!material || visited.has(material) || material.uuid !== materialId || !(slot in material)) return;
          visited.add(material);
          const previousTexture = material[slot];
          material[slot] = texture;
          material.needsUpdate = true;
          if (previousTexture && previousTexture !== texture) previousTexture.dispose?.();
          changed = true;
        });
      });
      if (!changed) texture.dispose?.();
      if (changed) refreshGpuEstimate();
      emitMaterialInfo();
      return changed;
    },
    removeMaterialTexture(materialId, slot = "map") {
      let changed = false;
      const visited = new Set();
      modelRef.current?.traverse?.((node) => {
        if (!node.isMesh) return;
        const sourceMaterial = node.userData?.originalViewportMaterial || node.material;
        const materials = Array.isArray(sourceMaterial) ? sourceMaterial : sourceMaterial ? [sourceMaterial] : [];
        materials.forEach((material) => {
          if (!material || visited.has(material) || material.uuid !== materialId || !material[slot]) return;
          visited.add(material);
          const oldTexture = material[slot];
          material[slot] = null;
          material.needsUpdate = true;
          oldTexture.dispose?.();
          changed = true;
        });
      });
      if (changed) refreshGpuEstimate();
      emitMaterialInfo();
      return changed;
    },
    setObjectTransform(id, patch = {}) {
      const object = findBySceneId(modelRef.current, id);
      if (!object || object.userData?.locked) return false;
      if (patch.position && typeof patch.position === "object") {
        object.position.set(
          Number.isFinite(Number(patch.position.x)) ? Number(patch.position.x) : object.position.x,
          Number.isFinite(Number(patch.position.y)) ? Number(patch.position.y) : object.position.y,
          Number.isFinite(Number(patch.position.z)) ? Number(patch.position.z) : object.position.z,
        );
      }
      const rotation = patch.rotationDegrees || patch.rotation;
      if (rotation && typeof rotation === "object") {
        const useDegrees = Boolean(patch.rotationDegrees);
        const convert = (value, fallback) => Number.isFinite(Number(value)) ? (useDegrees ? THREE.MathUtils.degToRad(Number(value)) : Number(value)) : fallback;
        object.rotation.set(convert(rotation.x, object.rotation.x), convert(rotation.y, object.rotation.y), convert(rotation.z, object.rotation.z));
      }
      if (patch.scale && typeof patch.scale === "object") {
        object.scale.set(
          Number.isFinite(Number(patch.scale.x)) ? Math.max(0.0001, Number(patch.scale.x)) : object.scale.x,
          Number.isFinite(Number(patch.scale.y)) ? Math.max(0.0001, Number(patch.scale.y)) : object.scale.y,
          Number.isFinite(Number(patch.scale.z)) ? Math.max(0.0001, Number(patch.scale.z)) : object.scale.z,
        );
      }
      object.updateMatrixWorld(true);
      refreshSelectionHelpers();
      emitSceneGraph();
      return true;
    },
    createGeneratedObject(kind, options = {}) {
      return createGeneratedObject(kind, options);
    },
    fractureObjects(ids = [], options = {}) {
      return fractureObjects(ids, options);
    },
    analyzeFor3DPrint(ids = []) {
      return analyzeFor3DPrint(ids);
    },
    retryLoad() { setReloadToken((value) => value + 1); },
    cancelLoad() { activeLoadRef.current?.cancel?.(); },
  }));

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    renderer.setPixelRatio(qualityPixelRatio(qualityRef.current));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);
    try {
      const gl = renderer.getContext();
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) gpuNameRef.current = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuNameRef.current;
    } catch {
      // GPU name is optional and may be blocked for privacy.
    }

    const canvasContext = renderer.domElement;
    const onContextLost = (event) => {
      event.preventDefault();
      contextLostRef.current = true;
      setStatus("context-lost");
      setProgressLabel("WebGL context lost — recovering…");
      onLoadState?.({ status: "context-lost", progress: progress, label: "WebGL context lost — recovering…" });
      window.setTimeout(() => {
        if (contextLostRef.current) renderer.forceContextRestore?.();
      }, 600);
    };
    const onContextRestored = () => {
      contextLostRef.current = false;
      renderer.resetState?.();
      renderer.setPixelRatio(qualityPixelRatio(qualityRef.current));
      setStatus(modelRef.current ? "ready" : "idle");
      setProgressLabel("WebGL context restored");
      onLoadState?.({ status: modelRef.current ? "ready" : "idle", progress: modelRef.current ? 100 : 0, label: "WebGL context restored" });
    };
    canvasContext.addEventListener("webglcontextlost", onContextLost, false);
    canvasContext.addEventListener("webglcontextrestored", onContextRestored, false);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x2b3139, 1.35);
    const ambient = new THREE.AmbientLight(0xffffff, 0.16);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 6, 5);
    key.castShadow = true;
    const fill = new THREE.DirectionalLight(0xa8c8ff, 1.05);
    fill.position.set(-4, 2, 2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.75);
    rim.position.set(0, 3, -5);
    lightsRef.current = { hemisphere, ambient, key, fill, rim };
    scene.add(hemisphere, ambient, key, fill, rim);

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
    canvas.tabIndex = 0;
    const onPointerDown = (event) => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey };
      canvas.focus?.({ preventScroll: true });
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
      const hits = raycasterRef.current.intersectObject(modelRef.current, true)
        .filter((hit) => hit.object?.isMesh && !hit.object.userData?.locked && hit.object.visible !== false);
      const selected = hits[0]?.object || null;
      if (selected) selectObjectsByIds([selected.userData?.sceneId || selected.uuid], Boolean(start.ctrl));
      else if (!start.ctrl) selectObjectsByIds([], false);
    };
    const onKeyDown = (event) => {
      if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const ids = selectedObjectsRef.current.map((object) => object.userData?.sceneId || object.uuid);
        if (ids.length) {
          const objects = ids.map((id) => findBySceneId(modelRef.current, id)).filter(Boolean);
          if (objects.length) {
            const box = new THREE.Box3();
            objects.forEach((object) => box.expandByObject(object));
            const camera = getActiveCamera();
            const controls = controlsRef.current;
            if (!box.isEmpty() && camera && controls) {
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());
              const radius = Math.max(size.length() * 0.5, 0.1);
              const direction = camera.position.clone().sub(controls.target).normalize();
              controls.target.copy(center);
              camera.position.copy(center).addScaledVector(direction, radius * 3.2);
              if (camera.isOrthographicCamera) camera.zoom = Math.max(0.1, 1.7 / radius);
              camera.updateProjectionMatrix();
              controls.update();
            }
          }
        }
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("keydown", onKeyDown);

    syncControlsCamera();

    const renderLoop = (time) => {
      controlsRef.current?.update?.();
      (selectionHelperRef.current || []).forEach((helper) => helper.update?.());
      renderer.render(scene, getActiveCamera());
      const metrics = frameMetricsRef.current;
      metrics.frames += 1;
      const elapsed = time - metrics.lastTime;
      if (elapsed >= 500) {
        metrics.fps = Math.round((metrics.frames * 1000) / Math.max(elapsed, 1));
        metrics.frames = 0;
        metrics.lastTime = time;

        if (qualityModeRef.current === "auto" && modelRef.current && !contextLostRef.current) {
          const adaptive = adaptiveQualityRef.current;
          if (metrics.fps > 0 && metrics.fps < 24) {
            adaptive.lowTicks += 1;
            adaptive.highTicks = 0;
          } else if (metrics.fps >= 52) {
            adaptive.highTicks += 1;
            adaptive.lowTicks = 0;
          } else {
            adaptive.lowTicks = Math.max(0, adaptive.lowTicks - 1);
            adaptive.highTicks = Math.max(0, adaptive.highTicks - 1);
          }

          const currentIndex = qualityIndex(qualityRef.current);
          const ceilingIndex = Math.max(0, qualityIndex(autoQualityCeilingRef.current));
          const now = performance.now();
          if (adaptive.lowTicks >= 5 && currentIndex > 0 && now - adaptive.lastChange > 2500) {
            qualityRef.current = ["low", "medium", "high", "ultra"][currentIndex - 1];
            renderer.setPixelRatio(qualityPixelRatio(qualityRef.current));
            renderer.shadowMap.enabled = qualityRef.current !== "low" && lightingConfigRef.current?.shadows !== false;
            adaptive.lowTicks = 0;
            adaptive.lastChange = now;
          } else if (adaptive.highTicks >= 12 && currentIndex >= 0 && currentIndex < ceilingIndex && now - adaptive.lastChange > 5000) {
            qualityRef.current = ["low", "medium", "high", "ultra"][currentIndex + 1];
            renderer.setPixelRatio(qualityPixelRatio(qualityRef.current));
            renderer.shadowMap.enabled = qualityRef.current !== "low" && lightingConfigRef.current?.shadows !== false;
            adaptive.highTicks = 0;
            adaptive.lastChange = now;
          }
        }
      }
      if (onPerformanceInfo && time - metrics.lastReport >= 800) {
        metrics.lastReport = time;
        const gpu = gpuEstimateRef.current;
        onPerformanceInfo({
          fps: metrics.fps,
          quality: qualityRef.current,
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          points: renderer.info.render.points,
          lines: renderer.info.render.lines,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          estimatedGpuBytes: gpu.totalBytes,
          geometryBytes: gpu.geometryBytes,
          textureBytes: gpu.textureBytes,
          renderer: renderer.capabilities?.isWebGL2 ? "WebGL2" : "WebGL",
          gpuName: gpuNameRef.current,
        });
      }
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
      canvas.removeEventListener("keydown", onKeyDown);
      if (activeLoadRef.current) {
        activeLoadRef.current.cancelled = true;
        activeLoadRef.current.readers.forEach((reader) => reader.abort?.());
        activeLoadRef.current.worker?.terminate?.();
      }
      if (modelRef.current) disposeObject(modelRef.current);
      gpuEstimateRef.current = { geometryBytes: 0, textureBytes: 0, totalBytes: 0 };
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      disposeMaterial(ground.material);
      ground.geometry.dispose();
      grid.geometry.dispose();
      canvasContext.removeEventListener("webglcontextlost", onContextLost, false);
      canvasContext.removeEventListener("webglcontextrestored", onContextRestored, false);
      environmentTextureRef.current?.dispose?.();
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
    emitSceneGraph();
  }, [projectionMode]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = Boolean(showGrid);
  }, [showGrid]);

  useEffect(() => {
    if (groundRef.current) groundRef.current.visible = Boolean(showGround);
  }, [showGround]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const stats = objectStats(modelRef.current);
    const statsShape = { triangleCount: stats.triangles, vertexCount: stats.vertices };
    const recommended = qualityForScene(statsShape, totalBytes, "auto");
    const quality = qualityMode === "auto" ? recommended : qualityForScene(statsShape, totalBytes, qualityMode);
    autoQualityCeilingRef.current = recommended;
    adaptiveQualityRef.current = { lowTicks: 0, highTicks: 0, lastChange: performance.now() };
    qualityRef.current = quality;
    renderer.setPixelRatio(qualityPixelRatio(quality));
    renderer.shadowMap.enabled = quality !== "low" && lightingConfig?.shadows !== false;
  }, [qualityMode, totalBytes, lightingConfig?.shadows]);

  useEffect(() => {
    applyShading(modelRef.current, shadingMode);
  }, [shadingMode]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    const config = {
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
      ...lightingConfig,
    };
    const color = kelvinToColor(config.temperature);
    const lights = lightsRef.current;
    if (lights.key) {
      lights.key.intensity = Math.max(0, Number(config.keyIntensity) || 0);
      lights.key.color.copy(color);
      lights.key.castShadow = Boolean(config.shadows) && qualityRef.current !== "low";
    }
    if (lights.fill) {
      lights.fill.intensity = Math.max(0, Number(config.fillIntensity) || 0);
      lights.fill.color.copy(color);
    }
    if (lights.rim) {
      lights.rim.intensity = Math.max(0, Number(config.rimIntensity) || 0);
      lights.rim.color.copy(color);
    }
    if (lights.ambient) {
      lights.ambient.intensity = Math.max(0, Number(config.ambientIntensity) || 0);
      lights.ambient.color.copy(color);
    }
    if (lights.hemisphere) lights.hemisphere.intensity = config.preset === "dark" ? 0.35 : config.preset === "outdoor" ? 1.8 : 1.15;
    renderer.shadowMap.enabled = Boolean(config.shadows) && qualityRef.current !== "low";
    renderer.setClearAlpha(config.transparentBackground ? 0 : 1);

    const backgroundColors = {
      studio: 0x202124,
      neutral: 0x4b4f55,
      softbox: 0x35383d,
      outdoor: 0x7f94a8,
      dark: 0x080a0d,
      custom: 0x202124,
    };
    scene.background = config.transparentBackground ? null : new THREE.Color(backgroundColors[config.preset] ?? 0x202124);
    if ("environmentIntensity" in scene) scene.environmentIntensity = Math.max(0, Number(config.environmentStrength) || 0);
    if (scene.environmentRotation?.isEuler) scene.environmentRotation.y = THREE.MathUtils.degToRad(Number(config.environmentRotation) || 0);
  }, [
    lightingConfig?.preset,
    lightingConfig?.environmentStrength,
    lightingConfig?.environmentRotation,
    lightingConfig?.keyIntensity,
    lightingConfig?.fillIntensity,
    lightingConfig?.rimIntensity,
    lightingConfig?.ambientIntensity,
    lightingConfig?.temperature,
    lightingConfig?.shadows,
    lightingConfig?.transparentBackground,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return undefined;
    let cancelled = false;
    const preset = lightingConfig?.preset || "studio";

    const setEnvironmentTexture = (texture) => {
      if (cancelled) {
        texture?.dispose?.();
        return;
      }
      environmentTextureRef.current?.dispose?.();
      environmentTextureRef.current = texture || null;
      scene.environment = texture || null;
    };

    const setupEnvironment = async () => {
      let sourceTexture = null;
      let temporaryUrl = "";
      try {
        if (customEnvironmentFile && preset === "custom") {
          const ext = extensionOf(customEnvironmentFile.name);
          temporaryUrl = URL.createObjectURL(customEnvironmentFile);
          if (ext === "exr") {
            const { EXRLoader } = await loaderImports.exr();
            sourceTexture = await new EXRLoader().loadAsync(temporaryUrl);
          } else {
            const { HDRLoader } = await loaderImports.hdr();
            sourceTexture = await new HDRLoader().loadAsync(temporaryUrl);
          }
          if (cancelled) return;
          sourceTexture.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(renderer);
          try {
            pmrem.compileEquirectangularShader();
            setEnvironmentTexture(pmrem.fromEquirectangular(sourceTexture).texture);
          } finally {
            pmrem.dispose();
          }
          return;
        }
        if (["studio", "softbox", "neutral"].includes(preset)) {
          const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
          if (cancelled) return;
          const pmrem = new THREE.PMREMGenerator(renderer);
          const envScene = new RoomEnvironment();
          try {
            pmrem.compileEquirectangularShader();
            setEnvironmentTexture(pmrem.fromScene(envScene, preset === "softbox" ? 0.08 : 0.04).texture);
          } finally {
            envScene.dispose?.();
            pmrem.dispose();
          }
          return;
        }
        setEnvironmentTexture(null);
      } catch (error) {
        console.warn("Environment setup failed", error);
        if (!cancelled) onError?.(`Lighting environment: ${error?.message || "could not load environment"}`);
      } finally {
        sourceTexture?.dispose?.();
        if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
      }
    };
    setupEnvironment();
    return () => { cancelled = true; };
  }, [lightingConfig?.preset, customEnvironmentFile]);


  useEffect(() => {
    if (!modelRef.current) return;
    const ids = Array.isArray(selectedObjectIds) ? selectedObjectIds : [];
    selectObjectsByIds(ids, false);
  }, [selectedObjectIds]);

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
    (selectionHelperRef.current || []).forEach((helper) => helper.update?.());
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
    const active = { cancelled: false, finished: false, readers: new Set(), worker: null, workerReject: null, fileProgress: null };
    activeLoadRef.current = active;
    active.fileProgress = (readingFile, loaded, total) => {
      if (active.cancelled || active.finished || !total) return;
      const ratio = loaded / total;
      setProgress(18 + ratio * 12, `Reading ${readingFile.name} · ${Math.round(ratio * 100)}%`);
    };

    const cancel = () => {
      active.cancelled = true;
      active.readers.forEach((reader) => reader.abort?.());
      active.worker?.terminate?.();
      active.worker = null;
      active.workerReject?.(new DOMException("Model loading cancelled", "AbortError"));
      active.workerReject = null;
      setStatus("cancelled");
      setProgressState(0);
      setProgressLabel("Loading cancelled");
      onLoadState?.({ status: "cancelled", progress: 0, label: "Loading cancelled" });
    };
    active.cancel = cancel;

    async function start() {
      setStatus("loading");
      selectedObjectsRef.current = [];
      setSelectedNames([]);
      refreshSelectionHelpers([]);
      onSelectionChange?.([]);
      onMaterialInfo?.({ selectedIds: [], materials: [] });
      setProgress(4, "Scanning model bundle");
      try {
        const dependencies = await analyzeDependencies(mainFile, files);
        if (active.cancelled) return;
        setProgress(12, "Checking linked files");

        const manager = new THREE.LoadingManager();
        if (files.some((item) => extensionOf(item.name) === "tga")) {
          const { TGALoader } = await loaderImports.tga();
          manager.addHandler(/\.tga(?:$|[?#])/i, new TGALoader(manager));
        }
        if (files.some((item) => extensionOf(item.name) === "dds")) {
          const { DDSLoader } = await loaderImports.dds();
          manager.addHandler(/\.dds(?:$|[?#])/i, new DDSLoader(manager));
        }
        manager.setURLModifier(buildFileResolver(files, objectUrls));
        manager.onProgress = (_url, loaded, total) => {
          if (!active.cancelled && !active.finished && total > 0) setProgress(64 + (loaded / total) * 18, `Loading linked resources ${loaded}/${total}`);
        };
        manager.onError = (url) => {
          if (!active.cancelled) console.warn("Three.js resource could not be resolved:", url);
        };

        const object = await loadModel(mainFile, files, manager, active, setProgress, rendererRef.current);
        if (active.cancelled) {
          disposeObject(object);
          return;
        }
        setProgress(78, "Preparing geometry");

        if (modelRef.current) {
          scene.remove(modelRef.current);
          disposeObject(modelRef.current);
          gpuEstimateRef.current = { geometryBytes: 0, textureBytes: 0, totalBytes: 0 };
        }
        for (const helper of selectionHelperRef.current || []) {
          scene.remove(helper);
          helper.geometry?.dispose?.();
          disposeMaterial(helper.material);
        }
        selectionHelperRef.current = [];

        const stats = await prepareObject(
          object,
          (ratio) => setProgress(78 + ratio * 9, `Preparing scene ${Math.round(ratio * 100)}%`),
          () => active.cancelled,
        );
        if (active.cancelled) {
          disposeObject(object);
          return;
        }
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
        ensureSceneIds(object);
        scene.add(object);
        modelRef.current = object;
        applyShading(object, shadingMode);

        const recommendedQuality = qualityForScene(stats, totalBytes, "auto");
        const selectedQuality = qualityMode === "auto" ? recommendedQuality : qualityForScene(stats, totalBytes, qualityMode);
        autoQualityCeilingRef.current = recommendedQuality;
        adaptiveQualityRef.current = { lowTicks: 0, highTicks: 0, lastChange: performance.now() };
        qualityRef.current = selectedQuality;
        if (rendererRef.current) {
          rendererRef.current.setPixelRatio(qualityPixelRatio(selectedQuality));
          rendererRef.current.shadowMap.enabled = selectedQuality !== "low" && lightingConfigRef.current?.shadows !== false;
        }
        const warnings = warningsForStats(stats, totalBytes, dependencies);
        if (selectedQuality === "low") warnings.push("Automatic quality lowered to protect frame rate and memory on this device/model.");
        const format = extensionOf(mainFile.name).toUpperCase();
        const gpuEstimate = refreshGpuEstimate();
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
          quality: selectedQuality,
          workerParsed: Boolean(object.userData?.importMaterialInfo?.workerParsed),
          gpuEstimate,
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
        setProgress(94, "Building scene index");
        onModelInfo?.(info);
        emitSceneGraph();
        emitMaterialInfo();

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
      active.worker?.terminate?.();
      active.worker = null;
      active.workerReject?.(new DOMException("Model loading cancelled", "AbortError"));
      active.workerReject = null;
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
      {selectedNames.length > 0 && <div className="threeSelectionBadge">Selected: {selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} objects`}</div>}
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
      {status === "context-lost" && <div className="threeModelStatus error">WebGL context lost — waiting for browser recovery…</div>}
      {status === "error" && (
        <div className="threeModelStatus error threeModelRetryStatus">{progressLabel || "3D model could not be rendered"} <button type="button" onClick={() => setReloadToken((value) => value + 1)}>Retry</button></div>
      )}
    </div>
  );
});

export default ThreeModelViewport;
