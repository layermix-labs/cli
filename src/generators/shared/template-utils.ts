import fs from "fs";
import path from "path";
import ejs from "ejs";
import { confirm } from "@inquirer/prompts";

export type GeneratedFile = {
  path: string;
  content: string;
};

/**
 * Renders the template with the specified variables
 */
export async function processTemplate(
  templatePath: string,
  data: Record<string, any>,
): Promise<string> {
  const template = fs.readFileSync(templatePath, "utf-8");
  console.log("Rendering", templatePath, data);
  return ejs.render(template, data);
}

/**
 * Ensures and confirms we want to write and overwrite files.
 *
 * File by file.
 */
export async function writeGeneratedFiles(
  files: GeneratedFile[],
): Promise<string[]> {
  const writtenFiles: string[] = [];

  for (const file of files) {
    const dir = path.dirname(file.path);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(file.path)) {
      const shouldOverwrite = await confirm({
        message: `File ${file.path} already exists. Overwrite?`,
        default: false,
      });

      if (!shouldOverwrite) {
        continue;
      }
    }

    fs.writeFileSync(file.path, file.content);
    writtenFiles.push(file.path);
  }

  return writtenFiles;
}

/**
 * Helper to make it easier to prepare a template while working in generators
 */
export async function prepareTemplate<T extends object>({
  data,
  domain,
  template,
  outputFile,
  templateRoot,
}: {
  data: T;
  domain: string;
  template: string;
  outputFile: string;
  templateRoot: string;
}) {
  // 3. Process templates
  const templateDir = path.join(
    __dirname,
    "generators",
    templateRoot,
    "templates",
  );
  const destinationDir = path.join("app", domain);
  const content = await processTemplate(
    path.join(templateDir, template),
    data satisfies T,
  );

  return {
    path: `${destinationDir}/${outputFile}`,
    content,
  };
}
