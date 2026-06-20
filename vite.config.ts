import { defineConfig } from "vite";
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
  // エントリはルート index.html（three-3d バリアント）のみ。Vite のデフォルトエントリに任せる。
});
