import { writeGeneratedFiles, GeneratedFile } from "../shared/template-utils";
import { selectOrCreateDomain } from "../shared/domain-utils";
import { input } from "@inquirer/prompts";
import { pascalCase } from "change-case";
import {
  generateFormPage,
  generatePageRoute,
} from "../shared/generatorFunctions";

function toPascalWithSuffix(input: string, suffix: string) {
  if (input.endsWith(suffix)) {
    if (input === suffix) {
      throw new Error(`Input cannot be just the suffix "${suffix}"`);
    }
    return input;
  }
  return pascalCase(input) + suffix;
}

export async function generatePage(): Promise<string[]> {
  // 1. Select or create domain
  const domain = await selectOrCreateDomain("app");

  // 2. Ask page-specific questions
  let pageName = await input({
    message: "What is the name of your page?",
    validate: (input: string) => {
      if (!input.trim()) return "Page name cannot be empty";
      return true;
    },
  });
  pageName = toPascalWithSuffix(pageName, "Page");

  // 3. Should we generate a route?
  const routeFile = await input({
    message: "Route file name: (leave empty to skip)",
    validate: (input: string) => {
      if (!input.trim()) return true;
      // Must end with .tsx
      if (!input.endsWith(".tsx")) return "Route file must end with .tsx";
      return true;
    },
  });

  const files: Promise<GeneratedFile>[] = [];

  if (routeFile) {
    files.push(
      generatePageRoute({
        pageName,
        domain,
        routeFile,
      }),
    );
  }

  files.push(
    generateFormPage({
      domain,
      pageName,
    }),
  );

  // 4. Write files and return paths
  const writtenFiles = await writeGeneratedFiles(await Promise.all(files));
  return writtenFiles;
}
