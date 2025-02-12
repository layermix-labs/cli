import path from "path";
import { formQuestions } from "./questions";
import { askQuestions } from "../shared/questions";
import {
  processTemplate,
  writeGeneratedFiles,
  GeneratedFile,
} from "../shared/template-utils";
import { selectOrCreateDomain } from "../shared/domain-utils";

export async function generateForm(): Promise<string[]> {
  const appPath = "app";
  // 1. Select or create domain
  const domain = await selectOrCreateDomain(appPath);

  // 2. Ask form-specific questions
  const answers = await askQuestions(formQuestions);

  // 3. Process templates
  const templateDir = path.join(__dirname, "templates");
  const destinationDir = path.join(appPath, domain, "components");

  const files: GeneratedFile[] = [];

  // Process form component
  const formContent = await processTemplate(
    path.join(templateDir, "form.ejs"),
    answers,
  );

  files.push({
    path: path.join(destinationDir, `${answers.formName}Form.tsx`),
    content: formContent,
  });

  // Process schema
  const schemaContent = await processTemplate(
    path.join(templateDir, "schema.ejs"),
    answers,
  );

  files.push({
    path: path.join(
      destinationDir,
      `${answers.formName.toLowerCase()}-schema.ts`,
    ),
    content: schemaContent,
  });

  // 4. Write files and return paths
  const writtenFiles = await writeGeneratedFiles(files);

  return writtenFiles;
}
