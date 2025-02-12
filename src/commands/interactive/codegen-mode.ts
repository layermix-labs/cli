import { select } from "@inquirer/prompts";
import { runCommand } from "../../utils/exec";
import { formatChoices } from "./table-formatter";
import { generateForm } from "../../generators/form";

export async function handleCodegenMode() {
  const codeGenMode = await select({
    message: "What would you like to generate?",
    choices: formatChoices([
      { value: "gen-form", columns: ["🧩 Functionality: Form + Schema"] },
      {
        // There will be more gen-* generators
        value: "gen-example",
        columns: ["🧩 Functionality: Generate Example"],
      },
      {
        value: "e2e-tests",
        columns: [
          "🔄 Playwright E2E Tests",
          "Runs playwright recorder against localhost:5173",
        ],
      },
      {
        value: "better-auth-prisma",
        columns: [
          "📜 Better Auth Prisma Reference Schema",
          "Updates auth-reference.schema.prisma based better-auth.server.ts",
        ],
      },
    ]),
  });
  switch (codeGenMode) {
    case "gen-form":
      const generatedFiles = await generateForm();
      console.log("\nGenerated files:");
      generatedFiles.forEach((file) => console.log(`- ${file}`));
      return;
    case "e2e-tests":
      runCommand("npx playwright codegen localhost:5173");
      return;
    case "better-auth-prisma":
      runCommand(
        "npx @better-auth/cli generate --config app/Auth/services/better-auth.server.ts --output ./app/Core/services/prisma/auth-reference.schema.prisma",
      );
      return;
    default:
      console.log("Code generation features coming soon! ", codeGenMode);
      return;
  }
}
