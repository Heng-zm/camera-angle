import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  optimizeDeps: {
    include: ["three"],
  },
  resolve: {
    dedupe: ["three"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
