import { runCommand } from "../../utils/exec";
import { select } from "@inquirer/prompts";
import * as fs from "fs";
import * as path from "path";

/**
 * Recursively finds all files in a directory that end with 'e2e.test.ts'.
 * @param dir The directory to search in.
 * @returns An array of file paths.
 */
function findPlaywrightTestFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findPlaywrightTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith("e2e.test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function playwrightDebug() {
  const e2eDir = "./e2e";
  const testFiles = findPlaywrightTestFiles(e2eDir);

  if (testFiles.length === 0) {
    console.log(
      `No Playwright tests (*.e2e.test.ts) found in the '${e2eDir}' directory.`,
    );
    return;
  }

    const selectedFile = await select({
      message: "Which Playwright test would you like to debug?",
      pageSize: 99,
      theme: {
        helpMode: "always",
      },
      choices: testFiles.map((file) => ({
        name: file,
        value: file,
      })),
    });

    if (selectedFile) {
      const safeFilePath = selectedFile.replace(/"/g, '\\"');
      const command = `pnpm playwright test "${safeFilePath}" --debug`;
      runCommand(command);
    }
}
