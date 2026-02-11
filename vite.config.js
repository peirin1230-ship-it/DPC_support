import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "/DPC_support/",
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2020",
    minify: "esbuild",
  },
});
