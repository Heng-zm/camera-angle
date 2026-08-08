import { defineConfig } from "vite";

const loaderChunkNames = [
  "OBJLoader", "MTLLoader", "STLLoader", "PLYLoader", "GLTFLoader", "FBXLoader",
  "ColladaLoader", "3MFLoader", "TDSLoader", "TGALoader", "DDSLoader",
  "DRACOLoader", "KTX2Loader", "HDRLoader", "EXRLoader",
];

export default defineConfig({
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["three"] },
  resolve: { dedupe: ["react", "react-dom", "three"] },
  worker: { format: "es" },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (path.includes("/node_modules/jszip/")) return "export-zip";
          for (const loader of loaderChunkNames) {
            if (path.includes(`/three/examples/jsm/loaders/${loader}.js`)) return `loader-${loader.toLowerCase()}`;
          }
          if (path.includes("/three/examples/jsm/libs/meshopt_decoder")) return "decoder-meshopt";
          if (path.includes("/three/examples/jsm/environments/")) return "three-environments";
          if (path.includes("/three/examples/jsm/postprocessing/")) return "three-postprocessing";
          if (path.includes("/three/examples/jsm/shaders/")) return "three-shaders";
          if (path.includes("/three/examples/jsm/controls/")) return "three-controls";
          if (path.includes("/node_modules/three/")) return "three-core";
          if (path.includes("/node_modules/react/") || path.includes("/node_modules/react-dom/")) return "react-vendor";
          if (path.includes("/node_modules/lucide-react/")) return "icons";
          return undefined;
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 5173 },
});
