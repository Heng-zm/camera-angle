export const BUILTIN_EXTENSIONS = [
  {
    id: "multiview.nature-generators",
    name: "Nature Generators",
    version: "1.0.0",
    author: "MultiView",
    category: "Generate",
    description: "Procedural terrain, trees, ivy, and cloud helpers for blocking out scenes.",
    permissions: ["scene:read", "scene:write"],
    enabledByDefault: true,
    actions: [
      {
        id: "terrain",
        label: "Generate Terrain",
        description: "Create a procedural ground mesh under the current model.",
        script: `studio.generate.terrain({ name: "Generated Terrain", size: 10, segments: 72, height: 1.15, seed: 17 });\nstudio.log("Terrain generator queued.");`,
      },
      {
        id: "tree",
        label: "Generate Tree",
        description: "Create a lightweight stylized tree from real Three.js geometry.",
        script: `studio.generate.tree({ name: "Generated Tree", height: 3.2, crownRadius: 1.15, seed: 11 });\nstudio.log("Tree generator queued.");`,
      },
      {
        id: "ivy",
        label: "Generate Ivy",
        description: "Create a procedural ivy curve around the selected object or scene center.",
        script: `studio.generate.ivy({ name: "Generated Ivy", turns: 5, radius: 1.35, height: 3.0, leaves: 32 });\nstudio.log("Ivy generator queued.");`,
      },
      {
        id: "cloud",
        label: "Generate Cloud",
        description: "Create a lightweight cloud cluster for scene composition tests.",
        script: `studio.generate.cloud({ name: "Generated Cloud", puffs: 12, radius: 1.8, seed: 23 });\nstudio.log("Cloud generator queued.");`,
      },
    ],
    contributions: {
      generators: [
        { id: "terrain-generator", label: "Terrain", actionId: "terrain" },
        { id: "tree-generator", label: "Tree", actionId: "tree" },
        { id: "ivy-generator", label: "Ivy", actionId: "ivy" },
        { id: "cloud-generator", label: "Cloud", actionId: "cloud" },
      ],
      inspectorPanels: [{ id: "nature-panel", title: "Nature Generators", actionIds: ["terrain", "tree", "ivy", "cloud"] }],
    },
  },
  {
    id: "multiview.fracture-preview",
    name: "Fracture Objects",
    version: "0.9.0",
    author: "MultiView",
    category: "Object",
    description: "Non-destructive fracture preview for selected meshes. Designed for blocking and layout, not final simulation.",
    permissions: ["scene:read", "scene:write"],
    enabledByDefault: false,
    experimental: true,
    actions: [
      {
        id: "fracture-12",
        label: "Fracture Preview · 12",
        description: "Generate twelve lightweight shard proxies around the current selection.",
        script: `studio.scene.fractureSelection({ pieces: 12, spread: 0.08 });\nstudio.log("Fracture preview queued for the current selection.");`,
      },
      {
        id: "fracture-24",
        label: "Fracture Preview · 24",
        description: "Generate a denser twenty-four-piece fracture preview.",
        script: `studio.scene.fractureSelection({ pieces: 24, spread: 0.12 });\nstudio.log("Dense fracture preview queued.");`,
      },
    ],
  },
  {
    id: "multiview.print-toolbox",
    name: "3D Printing Toolbox",
    version: "1.0.0",
    author: "MultiView",
    category: "Analysis",
    description: "Inspect selected geometry for dimensions, open edges, triangle count, and print-readiness warnings.",
    permissions: ["scene:read"],
    enabledByDefault: true,
    actions: [
      {
        id: "analyze-print",
        label: "Analyze for 3D Print",
        description: "Run a lightweight manifold/open-edge and bounds analysis on selected geometry.",
        script: `studio.scene.analyze3DPrint();\nstudio.log("3D Print analysis requested.");`,
      },
    ],
  },
  {
    id: "multiview.meta-rig",
    name: "Meta-Rig Generator",
    version: "0.8.0",
    author: "MultiView",
    category: "Rigging",
    description: "Generate a Blender-inspired humanoid meta-rig helper. It does not skin the mesh automatically yet.",
    permissions: ["scene:write"],
    enabledByDefault: false,
    experimental: true,
    actions: [
      {
        id: "human-meta-rig",
        label: "Add Humanoid Meta-Rig",
        description: "Create a basic bone hierarchy/helper for rig layout work.",
        script: `studio.generate.metaRig({ name: "Humanoid Meta-Rig", height: 2.4 });\nstudio.log("Humanoid meta-rig queued.");`,
      },
    ],
  },
  {
    id: "multiview.exchange-toolkit",
    name: "Exchange Toolkit",
    version: "1.0.0",
    author: "MultiView",
    category: "Import / Export",
    description: "Extra scene/camera exchange actions for pipelines and game-engine handoff.",
    permissions: ["scene:read", "camera:read", "export:write"],
    enabledByDefault: true,
    actions: [
      {
        id: "export-camera",
        label: "Export Camera JSON",
        description: "Export the exact Target Camera settings.",
        script: `studio.export.camera();`,
      },
      {
        id: "export-scene",
        label: "Export Scene JSON",
        description: "Export the current scene hierarchy and studio settings.",
        script: `studio.export.scene();`,
      },
      {
        id: "export-unreal-camera",
        label: "Unreal Camera JSON",
        description: "Export a compact camera handoff file using Unreal-style field names.",
        script: `studio.export.unrealCamera();`,
      },
    ],
    contributions: {
      exporters: [
        { id: "camera-json", label: "Camera JSON", actionId: "export-camera", extensions: [".json"] },
        { id: "scene-json", label: "Scene JSON", actionId: "export-scene", extensions: [".json"] },
        { id: "unreal-camera", label: "Unreal Camera JSON", actionId: "export-unreal-camera", extensions: [".json"] },
      ],
    },
  },
  {
    id: "multiview.camera-automation",
    name: "Camera Automation",
    version: "1.0.0",
    author: "MultiView",
    category: "Camera",
    description: "Scriptable camera recipes for repeatable studio shots and turntable setups.",
    permissions: ["camera:read", "camera:write"],
    enabledByDefault: true,
    actions: [
      {
        id: "hero-85",
        label: "85mm Product Hero",
        description: "Apply a clean product hero camera recipe.",
        script: `studio.camera.set({ azimuth: 42, elevation: 18, distance: 34, lens: "85mm", focus: "center" });\nstudio.log("Applied 85mm Product Hero camera.");`,
      },
      {
        id: "catalog-front",
        label: "50mm Catalog Front",
        description: "Apply a neutral catalog front camera.",
        script: `studio.camera.set({ azimuth: 0, elevation: 4, distance: 48, lens: "50mm", focus: "center" });\nstudio.log("Applied 50mm Catalog Front camera.");`,
      },
      {
        id: "top-food",
        label: "35mm Food Top",
        description: "Apply a top-down food/product camera recipe.",
        script: `studio.camera.set({ azimuth: 0, elevation: 85, distance: 52, lens: "35mm", focus: "center" });\nstudio.log("Applied 35mm top-down camera.");`,
      },
    ],
    contributions: {
      toolbar: [
        { id: "hero-toolbar", label: "Hero", actionId: "hero-85" },
        { id: "catalog-toolbar", label: "Catalog", actionId: "catalog-front" },
      ],
      inspectorPanels: [{ id: "camera-recipes", title: "Camera Recipes", actionIds: ["hero-85", "catalog-front", "top-food"] }],
      shortcuts: [{ id: "hero-shortcut", label: "85mm Product Hero", combo: "Alt+Shift+H", actionId: "hero-85" }],
    },
  },
];

export const SCRIPT_TEMPLATES = [
  {
    id: "camera",
    name: "Camera Recipe",
    code: `// Camera recipe\nstudio.camera.set({\n  azimuth: 45,\n  elevation: 20,\n  distance: 38,\n  lens: "85mm",\n  focus: "center",\n});\n\nstudio.log("Camera updated");`,
  },
  {
    id: "selection",
    name: "Selection Tools",
    code: `// Inspect the current selection\nconst selected = studio.scene.selection();\nstudio.log("Selected IDs:", selected);\n\nif (selected.length) {\n  studio.scene.frame(selected);\n}`,
  },
  {
    id: "generator",
    name: "Generator",
    code: `// Generate a procedural object\nstudio.generate.terrain({\n  name: "Script Terrain",\n  size: 8,\n  segments: 64,\n  height: 0.8,\n  seed: 42,\n});`,
  },
  {
    id: "lighting",
    name: "Lighting",
    code: `// Studio lighting recipe\nstudio.lighting.set({\n  preset: "studio",\n  environmentStrength: 0.8,\n  keyIntensity: 2.0,\n  fillIntensity: 0.7,\n  rimIntensity: 1.2,\n  ambientIntensity: 0.25,\n  temperature: 5600,\n  shadows: true,\n});`,
  },
  {
    id: "extension",
    name: "Extension Action",
    code: `// Extension actions use the same safe command bridge.\nstudio.log("Hello from MultiView Scripting");\nstudio.scene.showAll();\nstudio.camera.set({ azimuth: 30, elevation: 15 });`,
  },
];

export const DEFAULT_SCRIPT = SCRIPT_TEMPLATES[0].code;

export const EXTENSION_TEMPLATE = {
  format: "multiview-extension",
  formatVersion: 2,
  manifest: {
    id: "yourname.my-extension",
    name: "My MultiView Extension",
    version: "1.0.0",
    author: "Your Name",
    category: "Custom",
    description: "Describe what your extension does.",
    permissions: ["scene:read", "scene:write", "file:read"],
    dependencies: [],
    settings: [
      { id: "enabledFeature", label: "Enabled feature", type: "boolean", default: true },
    ],
  },
  actions: [
    {
      id: "hello",
      label: "Run My Tool",
      description: "Example extension action.",
      script: `studio.log("Hello from my extension");
studio.generate.tree({ name: "Extension Tree", height: 2.5 });`,
    },
  ],
  contributions: {
    toolbar: [{ id: "hello-toolbar", label: "My Tool", actionId: "hello" }],
    inspectorPanels: [{ id: "my-panel", title: "My Extension", actionIds: ["hello"] }],
    outlinerMenu: [],
    importers: [{ id: "json-importer", label: "JSON Importer", extensions: [".json"], script: `const data = studio.input.json(); studio.log("Imported", studio.input.name(), data);` }],
    exporters: [],
    generators: [],
    renderHooks: [],
    shortcuts: [{ id: "hello-shortcut", label: "Run My Tool", combo: "Alt+Shift+M", actionId: "hello" }],
  },
};
