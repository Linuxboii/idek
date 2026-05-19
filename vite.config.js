import { defineConfig } from "vite";

export default defineConfig({
  root: "app/static",
  server: {
    port: 5173,
    proxy: {
      "/api": "https://wa-slilg.avlokai.com",
    },
  },
});
