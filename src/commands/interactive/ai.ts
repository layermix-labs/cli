import { confirm, editor } from "@inquirer/prompts";
import { execSync } from "child_process";

function isAiderAvailable(): boolean {
  try {
    execSync("which aider");
    return true;
  } catch {
    return false;
  }
}

export default async function enhanceWithAI(filePaths: string[]) {
  if (!isAiderAvailable()) {
    console.log("Aider is not installed. Skipping AI enhancement.");
    console.log("Visit https://aider.chat to learn how to install aider");
    return;
  }

  const shouldEnhance = await confirm({
    message: "Would you like to enhance your code with AI?",
    default: true,
  });

  if (!shouldEnhance) return;

  const message = await editor({
    message: "How would you like to augment the generated code?",
    postfix: ".md",
    validate: (value) => value.trim().length > 0,
  });

  if (!message?.trim()) {
    console.log("No message provided. Skipping AI enhancement.");
    return;
  }

  try {
    const command = `aider --no-auto-commits --message "${message}" ${filePaths.join(" ")}`;
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.error("Failed to run aider:", error);
  }
}
