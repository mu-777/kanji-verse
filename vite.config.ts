import { defineConfig } from "vite";
import { resolve } from "path";
import compression from "vite-plugin-compression";

export default defineConfig({
  base: "/kanji-verse/",
  server: {
    watch: {
      // WSL2 で /mnt/c/ 配下を監視する場合、inotify が機能しないためポーリングが必要
      usePolling: true,
    },
  },
  plugins: [
    compression(),           // gzip (.gz)
    compression({ algorithm: "brotliCompress", ext: ".br" }),  // brotli (.br)
  ],
  build: {
    rollupOptions: {
      input: {
        index:          resolve(__dirname, "index.html"),
        "2d":           resolve(__dirname, "pages/2d/index.html"),
        "2d-bloom":     resolve(__dirname, "pages/2d-bloom/index.html"),
        "three-nebula": resolve(__dirname, "pages/three-nebula/index.html"),
      },
    },
  },
});
