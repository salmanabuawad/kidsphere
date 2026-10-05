/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Production CSP is `script-src 'self'`, so the built index.html must not
 * contain any inline <script>. Fail the build if one sneaks in.
 */
function noInlineScripts(): Plugin {
  return {
    name: "kidsphere:no-inline-scripts",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
        ([, attrs, body]) => !/\bsrc\s*=/.test(attrs) || body.trim() !== "",
      );
      if (inline.length) throw new Error("index.html must not contain inline <script> (CSP script-src 'self')");
      return html;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), noInlineScripts()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:3071", changeOrigin: false } },
  },
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    pool: "threads",
    poolOptions: { threads: { maxThreads: 2, minThreads: 1 } },
  },
});
