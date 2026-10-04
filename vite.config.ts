import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "scripts",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      formats: ["es"],
      fileName: () => "module.js"
    },
    rollupOptions: {
      output: {
        assetFileNames: "module.[ext]"
      }
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/i18n.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"]
    }
  }
});
