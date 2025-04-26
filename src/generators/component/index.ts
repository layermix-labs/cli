import { input } from "@inquirer/prompts";
import { selectOrCreateDomain } from "../shared/domain-utils";
import {
  generateUIComponent,
  generateUIComponentTest,
} from "../shared/generatorFunctions";
import { writeGeneratedFiles } from "../shared/template-utils";

export default async function generateComponent(): Promise<string[]> {
  // 1. Select or create domain
  const domain = await selectOrCreateDomain("app");

  let componentName = await input({
    message: "What is the name of your component?",
    validate: (input: string) => {
      if (!input.trim()) return "Component name cannot be empty";
      // Check if it's not capitalized
      if (input[0] !== input[0].toUpperCase()) {
        return "Custom React Component must start with a capital letter";
      }
      return true;
    },
  });

  const createdFiles = [
    await generateUIComponent({
      componentName,
      domain,
    }),
    await generateUIComponentTest({
      componentName,
      domain,
    }),
  ];

  return await writeGeneratedFiles(createdFiles);
}
