import { defineConfig } from "tsup";

export default defineConfig({
  tsconfig: "./tsconfig.json",
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: true,
  shims: true,
  onSuccess: "node dist/index.js",
});
