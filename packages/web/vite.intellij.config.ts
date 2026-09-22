import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/spek/webview/",
  // Single-file IIFE: no code splitting, so a dynamic import of Mermaid would be inlined rather than
  // deferred (+5.23 MB on a 719 KB bundle). Diagrams show their source here instead. The alias makes
  // the absence a fact about the bundle rather than a hope about tree-shaking.
  define: { __SPEK_DRAWS_DIAGRAMS__: "false" },
  resolve: {
    alias: { mermaid: path.resolve(__dirname, "src/utils/mermaidUnavailable.ts") },
  },
  build: {
    outDir: path.resolve(__dirname, "../intellij/src/main/resources/webview"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.intellij.html"),
      output: {
        format: "iife",
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
        manualChunks: undefined,
      },
    },
  },
});
