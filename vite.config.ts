import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/fss": {
        target: "https://www.fss.or.kr",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fss/, "/openapi/api"),
      },
    },
  },
});
