import { execSync } from "child_process";

export const runCommand = (command: string) => {
  try {
    console.log(`➡️ ${command}`);
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    process.exit(1);
  }
};
