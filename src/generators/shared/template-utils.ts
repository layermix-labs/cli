import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { confirm } from '@inquirer/prompts';

export type GeneratedFile = {
  path: string;
  content: string;
};

export async function processTemplate(
  templatePath: string,
  data: Record<string, any>
): Promise<string> {
  const template = fs.readFileSync(templatePath, 'utf-8');
  return ejs.render(template, data);
}

export async function writeGeneratedFiles(
  files: GeneratedFile[]
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
        default: false
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
