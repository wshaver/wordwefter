import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const includesTestHooks = mode === "test";
  const entryFileNames = includesTestHooks ? "game.js" : "game-[hash].js";
  const chunkFileNames = includesTestHooks ? "[name].js" : "[name]-[hash].js";

  return {
    publicDir: false,
    define: {
      __WORDWEFTER_INCLUDE_TEST_HOOKS__: JSON.stringify(includesTestHooks)
    },
    build: {
      outDir: includesTestHooks ? "public/dist-test" : "public/dist",
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        input: "src/game.js",
        output: {
          entryFileNames,
          chunkFileNames,
          assetFileNames: "[name][extname]"
        }
      }
    }
  };
});
