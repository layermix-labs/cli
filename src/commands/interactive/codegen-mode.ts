import { select } from "@inquirer/prompts";
import { runCommand } from "../../utils/exec";
import { formatChoices } from "./table-formatter";

export async function handleCodegenMode() {
  const codeGenMode = await select({
    message: "What would you like to generate?",
    choices: formatChoices([
      { value: "form", columns: ["🏗️ Functionality: Form + Schema"] },
      {
        value: "page",
        columns: ["🏗️ Functionality: Page + Form + Action + Schema"],
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
