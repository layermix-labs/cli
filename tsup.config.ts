import { defineConfig } from "tsup";

export default defineConfig({
  tsconfig: "./tsconfig.json",
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: true,
  shims: true,
  onSuccess: async () => {
    // TODO: Copy templates to dist
  },
});
