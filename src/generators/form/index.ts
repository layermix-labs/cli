import {
  writeGeneratedFiles,
  GeneratedFile,
  prepareTemplate,
} from "../shared/template-utils";
import { selectOrCreateDomain } from "../shared/domain-utils";
import { camelCase, capitalCase, pascalCase } from "change-case";
import { input } from "@inquirer/prompts";
import { generateFormRoute } from "../shared/generatorFunctions";

function toPascalWithSuffix(input: string, suffix: string) {
  if (input.endsWith(suffix)) {
    if (input === suffix) {
      throw new Error(`Input cannot be just the suffix "${suffix}"`);
    }
    return input;
  }

  return pascalCase(input) + suffix;
}

function stripSuffix(input: string, suffix: string) {
  if (input.endsWith(suffix)) {
    return input.slice(0, -suffix.length);
  }
  return input;
}

export async function generateForm(): Promise<string[]> {
  // 1. Select or create domain
  const domain = await selectOrCreateDomain("app");

  // 2. Ask form-specific questions
  let formName = await input({
    message: "What is the name of your form?",
    validate: (input: string) => {
      if (!input.trim()) return "Form name cannot be empty";
      return true;
    },
  });
  formName = stripSuffix(formName, "Form");

  // 2. Should we generate a route?
  const routeFile = await input({
    message: "Route file name: (leave empty to skip)",
    validate: (input: string) => {
      if (!input.trim()) return true;
      // Must end with .tsx
      if (!input.endsWith(".tsx")) return "Route file must end with .tsx";
      return true;
    },
  });

  let pageName = await input({
    message: "Page name: (leave empty to skip)",
    validate: (input: string) => {
      if (!input.trim()) return true;
      return true;
    },
  });
  pageName = toPascalWithSuffix(pageName, "Page");

  // Assume other variables
  const formTitle = capitalCase(formName);
  const schemaName = `${camelCase(formName)}Schema`;
  const actionName = `${camelCase(formName)}Action`;

  type FormGeneratorInputs = {
    actionName: string;
    formTitle: string;
    formName: string;
    schemaName: string;
  };

  type SchemaGeneratorInputs = {
    formName: string;
    schemaName: string;
  };

  type ActionGeneratorInputs = {
    formName: string;
    actionName: string;
    schemaName: string;
  };

  type PageGeneratorInputs = {
    pageName: string;
    formName: string;
    domain: string;
  };

  const files: Promise<GeneratedFile>[] = [];

  if (routeFile) {
    files.push(
      generateFormRoute({
        domain,
        routeFile,
        pageName,
        actionName,
      }),
    );
  }

  if (pageName) {
    files.push(
      prepareTemplate<PageGeneratorInputs>({
        data: {
          formName,
          pageName,
          domain,
        },
        domain,
        template: "page-with-form.ejs",
        templateRoot: "form",
        outputFile: `components/${pageName}/${pageName}.tsx`,
      }),
    );
  }

  files.push(
    prepareTemplate<FormGeneratorInputs>({
      data: {
        actionName,
        formName,
        formTitle,
        schemaName,
      },
      domain,
      template: "form.ejs",
      templateRoot: "form",
      outputFile: `components/${formName}Form/${formName}Form.tsx`,
    }),
  );

  files.push(
    prepareTemplate<SchemaGeneratorInputs>({
      data: {
        formName,
        schemaName,
      },
      domain,
      template: "schema.ejs",
      templateRoot: "form",
      outputFile: `schemas/${schemaName}.ts`,
    }),
  );

  files.push(
    prepareTemplate<ActionGeneratorInputs>({
      data: {
        formName,
        actionName,
        schemaName,
      },
      domain,
      template: "action.ejs",
      templateRoot: "form",
      outputFile: `actions/${actionName}.server.ts`,
    }),
  );

  // 4. Write files and return paths
  const writtenFiles = await writeGeneratedFiles(await Promise.all(files));

  return writtenFiles;
}
