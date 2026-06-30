import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const includesTestHooks = mode === "test";

  return {
    publicDir: false,
    define: {
      __WORDWEFTER_INCLUDE_TEST_HOOKS__: JSON.stringify(includesTestHooks)
    },
    build: {
      outDir: includesTestHooks ? "public/dist-test" : "public/dist",
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: "src/game.js",
        output: {
          entryFileNames: "game.js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name][extname]"
        }
      }
    }
  };
});
