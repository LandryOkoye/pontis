import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The wallet libraries require Node's `buffer`. Vite would otherwise stub it out, and the
      // NEAR wallet selector then crashes on load in live mode.
      buffer: fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url)),
    },
  },
  // Wallet libraries still reach for Node's `global`.
  define: { global: "globalThis" },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    testTimeout: 15_000,
  },
});
