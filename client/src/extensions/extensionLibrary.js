export const EXTENSION_LIBRARY = [
  {
    format: "multiview-extension",
    formatVersion: 2,
    manifest: {
      id: "multiview.archviz-tools",
      name: "ArchViz Tools",
      version: "1.2.0",
      author: "MultiView Labs",
      category: "Architecture",
      description: "Camera, lighting, and scene helpers for architecture visualization workflows.",
      permissions: ["scene:read", "scene:write", "camera:write", "lighting:write", "file:read"],
      dependencies: [],
      settings: [
        { id: "defaultLens", label: "Default lens", type: "select", default: "35mm", options: ["24mm", "35mm", "50mm"] },
        { id: "softLight", label: "Soft lighting", type: "boolean", default: true },
      ],
    },
    actions: [
      { id: "arch-camera", label: "Architecture Camera", description: "Apply a wide architecture camera.", script: 'studio.camera.set({ azimuth: 35, elevation: 10, distance: 58, lens: "35mm", focus: "center" });' },
      { id: "arch-light", label: "ArchViz Lighting", description: "Apply a neutral bright environment.", script: 'studio.lighting.set({ preset: "neutral", environmentStrength: 1.15, keyIntensity: 2.4, fillIntensity: 1.7, rimIntensity: 0.25, ambientIntensity: 0.3, temperature: 6200 });' },
    ],
    contributions: {
      toolbar: [{ id: "arch-camera", label: "Arch Camera", icon: "camera", actionId: "arch-camera" }],
      inspectorPanels: [{ id: "archviz", title: "ArchViz", actionIds: ["arch-camera", "arch-light"] }],
      outlinerMenu: [{ id: "frame-arch", label: "Frame Architecture", script: "studio.scene.frame();" }],
      shortcuts: [{ id: "arch-camera-shortcut", label: "Architecture Camera", combo: "Alt+Shift+A", actionId: "arch-camera" }],
      generators: [],
      exporters: [{ id: "scene-json", label: "Scene JSON", extensions: [".json"], script: "studio.export.scene();" }],
      importers: [{ id: "camera-recipe-json", label: "Camera Recipe JSON", extensions: [".json"], script: 'const data = studio.input.json(); studio.camera.set(data.camera || data); studio.log("Imported camera recipe from", studio.input.name());' }],
      renderHooks: [],
    },
  },
  {
    format: "multiview-extension",
    formatVersion: 2,
    manifest: {
      id: "multiview.product-studio",
      name: "Product Studio",
      version: "1.4.0",
      author: "MultiView Labs",
      category: "Product",
      description: "Repeatable product cameras, lighting recipes, and render hooks.",
      permissions: ["camera:write", "lighting:write", "render:write", "export:write"],
      dependencies: [],
      settings: [
        { id: "heroLens", label: "Hero lens", type: "select", default: "85mm", options: ["50mm", "85mm", "105mm"] },
        { id: "rimStrength", label: "Rim strength", type: "number", min: 0, max: 5, step: 0.1, default: 1.2 },
      ],
    },
    actions: [
      { id: "hero", label: "Product Hero", description: "Apply an 85mm product hero setup.", script: 'studio.camera.set({ azimuth: 42, elevation: 18, distance: 34, lens: "85mm", focus: "center" }); studio.lighting.set({ preset: "softbox", keyIntensity: 2.6, fillIntensity: 1.35, rimIntensity: 1.2, ambientIntensity: 0.18 });' },
      { id: "catalog", label: "Catalog Front", description: "Apply a front catalog setup.", script: 'studio.camera.set({ azimuth: 0, elevation: 4, distance: 48, lens: "50mm", focus: "center" }); studio.lighting.set({ preset: "neutral", keyIntensity: 2.1, fillIntensity: 1.6, rimIntensity: 0.2 });' },
    ],
    contributions: {
      toolbar: [{ id: "hero-toolbar", label: "Hero", icon: "camera", actionId: "hero" }],
      inspectorPanels: [{ id: "product-camera", title: "Product Studio", actionIds: ["hero", "catalog"] }],
      outlinerMenu: [],
      shortcuts: [{ id: "hero-shortcut", label: "Product Hero", combo: "Alt+Shift+H", actionId: "hero" }],
      generators: [],
      exporters: [{ id: "camera-json", label: "Camera JSON", extensions: [".json"], script: "studio.export.camera();" }],
      importers: [],
      renderHooks: [
        { id: "before-product-render", phase: "before", label: "Product pre-render", script: 'studio.lighting.set({ rimIntensity: studio.settings.get("rimStrength", 1.2) }); studio.log("Product Studio pre-render hook");' },
        { id: "after-product-render", phase: "after", label: "Product post-render", script: 'studio.log("Product Studio post-render hook");' },
      ],
    },
  },
  {
    format: "multiview-extension",
    formatVersion: 2,
    manifest: {
      id: "multiview.procedural-rocks",
      name: "Procedural Rocks",
      version: "1.1.0",
      author: "MultiView Labs",
      category: "Generate",
      description: "Quick procedural rock blocking tools for environment scenes.",
      permissions: ["scene:write"],
      dependencies: [],
      settings: [
        { id: "rockCount", label: "Rock count", type: "number", min: 1, max: 50, step: 1, default: 8 },
      ],
    },
    actions: [
      { id: "rock", label: "Generate Rock", description: "Generate a rock proxy from a distorted sphere primitive.", script: 'studio.generate.primitive("sphere", { name: "Procedural Rock", radius: 0.8, segments: 16, roughness: 0.9 });' },
      { id: "rock-field", label: "Rock Field", description: "Generate several lightweight rock proxies.", script: 'for (let i=0;i<6;i+=1) studio.generate.primitive("sphere", { name: `Rock ${i+1}`, radius: 0.35 + i*0.05, segments: 12, position: { x: (i-3)*0.7, y: 0.25, z: (i%2)*0.8 } });' },
    ],
    contributions: {
      toolbar: [],
      inspectorPanels: [{ id: "rocks", title: "Procedural Rocks", actionIds: ["rock", "rock-field"] }],
      outlinerMenu: [{ id: "rock-around-selection", label: "Add Rock Near Selection", actionId: "rock" }],
      shortcuts: [],
      generators: [{ id: "rock-generator", label: "Rock Generator", actionId: "rock" }],
      exporters: [],
      importers: [],
      renderHooks: [],
    },
  },
];

export function compareVersions(a = "0.0.0", b = "0.0.0") {
  const pa = String(a).split(/[.-]/).map((part) => Number(part) || 0);
  const pb = String(b).split(/[.-]/).map((part) => Number(part) || 0);
  const count = Math.max(pa.length, pb.length);
  for (let index = 0; index < count; index += 1) {
    const left = pa[index] || 0;
    const right = pb[index] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}
