import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  optimizeDeps: {
    include: ["three"],
  },
  resolve: {
    dedupe: ["react", "react-dom", "three"],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Three.js is intentionally lazy-loaded. This higher limit avoids a noisy
    // warning for the isolated 3D vendor chunk while keeping the initial app small.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (path.includes("/node_modules/three/examples/jsm/loaders/")) return "three-loaders";
          if (path.includes("/node_modules/three/examples/jsm/controls/")) return "three-controls";
          if (path.includes("/node_modules/three/")) return "three-core";
          if (path.includes("/node_modules/react/") || path.includes("/node_modules/react-dom/")) return "react-vendor";
          if (path.includes("/node_modules/lucide-react/")) return "icons";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
