import { select } from "@inquirer/prompts";
import { runCommand } from "../../utils/exec";

export async function handleCodegenMode() {
  const codeGenMode = await select({
    message: "What would you like to generate?",
    choices: [
      { value: "form", name: "Functionality: Form" },
      { value: "page", name: "Functionality: Page + Form + Action + Schema" },
      {
        value: "e2e-tests",
        name: "Playwright E2E Tests",
      },
      {
        value: "better-auth-prisma",
        name: "Better Auth Prisma Reference Schema",
      },
    ],
  });

  if (codeGenMode === "e2e-tests") {
    runCommand("npx playwright codegen localhost:5173");
    return;
  }

  if (codeGenMode === "better-auth-prisma") {
    runCommand(
      "npx @better-auth/cli generate --config app/Auth/services/better-auth.server.ts --output ./app/Core/services/prisma/auth-reference.schema.prisma",
    );
    return;
  }
  console.log("Code generation features coming soon! ", codeGenMode);
}
