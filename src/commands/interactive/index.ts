import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { select as multiselect } from "inquirer-select-pro";

import { runCommand } from "../../utils/exec";

const checkOptions = [
  { name: "style", message: "Style (Biome)", value: "check:style" },
  { name: "types", message: "Types (TSC)", value: "check:types" },
  { name: "unused", message: "Unused Code (Knip)", value: "check:unused-code" },
  { name: "tests", message: "Unit Tests (Vitest)", value: "check:tests" },
  { name: "e2e", message: "E2E Tests (Playwright)", value: "check:e2e" },
  { name: "lint", message: "Linting (Biome)", value: "check:lint" },
  { name: "format", message: "Formatting (Biome)", value: "check:format" },
  { name: "imports", message: "Import Organization", value: "check:imports" },
];

export async function handleInteractiveMode() {
  const mode = await select({
    message: "What would you like to do?",
    choices: [
      { value: "checks", name: "Run Checks" },
      { value: "codegen", name: "Generate Code" },
    ],
  });

  if (mode === "checks") {
    const selected = await multiselect({
      message: "Select checks to run",
      options: checkOptions,
    });

    for (const check of selected) {
      runCommand(`yarn ${check}`);
    }
  } else if (mode === "codegen") {
    console.log("Code generation features coming soon!");
  }
}
