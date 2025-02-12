import { select } from "@inquirer/prompts";
import { handleChecksMode } from "./checks-mode";
import { handleCodegenMode } from "./codegen-mode";

export async function handleInteractiveMode() {
  const mode = await select({
    message: "What would you like to do?",
    choices: [
      { value: "checks", name: "Run Checks" },
      { value: "codegen", name: "Generate Code" },
    ],
  });

  if (mode === "checks") {
    await handleChecksMode();
  } else if (mode === "codegen") {
    await handleCodegenMode();
  }
}
