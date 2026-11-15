import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project site: https://luxsugerostudios.github.io/Luxsugero-hq/
export default defineConfig({
  base: "/Luxsugero-hq/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
