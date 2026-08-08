/* MultiView Camera Studio — geometry parser worker
 * Heavy OBJ/STL/PLY parsing is kept off the UI thread. Vite bundles this
 * worker and its Three.js loader dependencies into independent chunks.
 */

function transferArray(array, transfers) {
  if (!array?.buffer) return null;
  transfers.push(array.buffer);
  return {
    type: array.constructor.name,
    buffer: array.buffer,
    byteOffset: array.byteOffset || 0,
    length: array.length,
  };
}

function serializeGeometry(geometry, transfers) {
  if (!geometry) return null;
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes || {})) {
    if (!attribute?.array) continue;
    attributes[name] = {
      itemSize: attribute.itemSize,
      normalized: Boolean(attribute.normalized),
      array: transferArray(attribute.array, transfers),
    };
  }
  const index = geometry.index?.array
    ? {
        itemSize: geometry.index.itemSize || 1,
        normalized: Boolean(geometry.index.normalized),
        array: transferArray(geometry.index.array, transfers),
      }
    : null;
  return {
    attributes,
    index,
    groups: (geometry.groups || []).map((group) => ({ ...group })),
    drawRange: geometry.drawRange ? { ...geometry.drawRange } : null,
  };
}

function colorHex(color, fallback = 0xb8c0ca) {
  try {
    return color?.isColor ? color.getHex() : fallback;
  } catch {
    return fallback;
  }
}

function serializeMaterial(material) {
  if (!material) return null;
  return {
    name: material.name || "",
    type: material.type || "MeshStandardMaterial",
    color: colorHex(material.color),
    emissive: colorHex(material.emissive, 0x000000),
    opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
    transparent: Boolean(material.transparent),
    roughness: Number.isFinite(material.roughness) ? material.roughness : 0.58,
    metalness: Number.isFinite(material.metalness) ? material.metalness : 0.05,
    wireframe: Boolean(material.wireframe),
    vertexColors: Boolean(material.vertexColors),
  };
}

function serializeObject(object, transfers, state) {
  const node = {
    type: object.isMesh ? "Mesh" : object.isPoints ? "Points" : object.isLine ? "Line" : "Group",
    name: object.name || `${object.isMesh ? "Mesh" : "Object"} ${++state.objectIndex}`,
    position: object.position?.toArray?.() || [0, 0, 0],
    quaternion: object.quaternion?.toArray?.() || [0, 0, 0, 1],
    scale: object.scale?.toArray?.() || [1, 1, 1],
    visible: object.visible !== false,
    geometry: object.geometry ? serializeGeometry(object.geometry, transfers) : null,
    materials: Array.isArray(object.material)
      ? object.material.map(serializeMaterial)
      : object.material
        ? [serializeMaterial(object.material)]
        : [],
    children: [],
  };
  for (const child of object.children || []) node.children.push(serializeObject(child, transfers, state));
  return node;
}

async function parseModel(format, payload) {
  if (format === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    const text = payload.text != null ? payload.text : new TextDecoder().decode(payload.buffer);
    return new OBJLoader().parse(text || "");
  }
  if (format === "stl") {
    const THREE = await import("three");
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(payload.buffer);
    geometry.computeVertexNormals?.();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb8c0ca, roughness: 0.58 }));
  }
  if (format === "ply") {
    const THREE = await import("three");
    const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
    const geometry = new PLYLoader().parse(payload.buffer);
    geometry.computeVertexNormals?.();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb8c0ca, roughness: 0.58, vertexColors: Boolean(geometry.attributes?.color) }));
  }
  throw new Error(`Worker parser does not support .${format}`);
}

self.onmessage = async (event) => {
  const { id, format, payload } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: "progress", progress: 10, label: `Worker parsing ${String(format || "").toUpperCase()}` });
    const object = await parseModel(format, payload || {});
    self.postMessage({ id, type: "progress", progress: 72, label: "Serializing geometry" });
    const transfers = [];
    const serialized = serializeObject(object, transfers, { objectIndex: 0 });
    self.postMessage({ id, type: "done", payload: serialized }, transfers);
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error?.message || String(error || "Worker parse failed"),
      stack: error?.stack || "",
    });
  }
};
