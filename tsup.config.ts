import { defineConfig } from "tsup";
import fs from "fs";
import path from "path";

export default defineConfig({
  tsconfig: "./tsconfig.json",
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: true,
  shims: true,
  noExternal: ["change-case"],
  onSuccess: async () => {
    // Create generators directory structure in dist
    const templateDirs = [
      "generators/form/templates",
      // Add other template directories here as needed
    ];

    for (const dir of templateDirs) {
      const srcDir = path.join("src", dir);
      const destDir = path.join("dist", dir);

      // Ensure destination directory exists
      fs.mkdirSync(destDir, { recursive: true });

      // Copy all files from src template dir to dist
      const files = fs.readdirSync(srcDir);
      for (const file of files) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }
    }
  },
});
