import { execSync } from "child_process";
import { setLastCommand } from "./config";

export const runCommand = (command: string) => {
  try {
    console.log(`➡️ ${command}`);
    setLastCommand(command);
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    process.exit(1);
  }
};
