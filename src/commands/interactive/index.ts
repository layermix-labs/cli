import { select } from "@inquirer/prompts";
import { select as multiselect } from "inquirer-select-pro";
import { checkList } from "../check/check-list";
import { executeChecks } from "../check/execute-checks";

export async function handleInteractiveMode() {
  const mode = await select({
    message: "What would you like to do?",
    choices: [
      { value: "checks", name: "Run Checks" },
      { value: "codegen", name: "Generate Code" },
    ],
  });

  if (mode === "checks") {
    const checkOptions = checkList
      .filter((check) => check.action || check.actionCi)
      .map((check) => ({
        name: check.name,
        message: check.description,
        value: check,
      }));

    const selected = await multiselect({
      message: "Select checks to run",
      options: checkOptions,
    });

    executeChecks(selected);
  } else if (mode === "codegen") {
    console.log("Code generation features coming soon!");
  }
}
