import { select } from "@inquirer/prompts";
import { handleChecksMode } from "./checks-mode";
import { formatChoices } from "./table-formatter";
import { generateForm } from "../../generators/form";
import { generatePage } from "../../generators/page";
import { runCommand } from "../../utils/exec";
import enhanceWithAI from "./ai";
import generateComponent from "../../generators/component";
import { playwrightDebug } from "./playwright-debug";
import { getLastCommand, setLastCommand } from "../../utils/config";

export async function handleInteractiveMode() {
  const choices = [
    { value: "checks", columns: ["✅ Run Checks"] },
    {
      value: "gen-form",
      columns: [
        "🧩 Generate: Form",
        "Form + Schema + Action",
        "(Page + Route)",
      ],
    },
    {
      value: "gen-component",
      columns: ["🧩 Generate: Component", "Component + (Test)"],
    },
    {
      value: "gen-page",
      columns: ["🧩 Generate: Page", "Page + (Route)"],
    },
    {
      value: "e2e-tests",
      columns: [
        "🎭 Playwright: Generate tests",
        "Runs playwright recorder against localhost:5173",
      ],
    },
    {
      value: "e2e-debug",
      columns: ["🎭 Playwright: Run with --debug"],
    },
    {
      value: "translations",
      columns: ["🌐 Generate Machine Translations"],
    },
    {
      value: "prisma-seed",
      columns: ["◭ Prisma: Seed Database", "Applies seeds.js"],
    },
    {
      value: "prisma-db-push",
      columns: [
        "◭ Prisma: Sync schema.prisma with the database",
        "Doesn't generate migration files",
      ],
    },
    {
      value: "prisma-db-reset",
      columns: [
        "◭ Prisma: Reset database",
        "Drops the database and runs migrations",
      ],
    },
    {
      value: "prisma-migrate",
      columns: ["◭ Prisma: Create migration", "Generates migration file"],
    },
    {
      value: "prisma-better-auth",
      columns: [
        "◭ Prisma: Generate Better Auth Reference Schema",
        "Updates auth-reference.schema.prisma based better-auth.server.ts",
      ],
    },
  ];

  const lastCommandValue = getLastCommand();
  let displayChoices = [...choices];

  if (lastCommandValue) {
    displayChoices.unshift({
      value: 'last-command',
      columns: [
        `🔁 Last used: ${lastCommandValue}`,
        lastCommandValue,
      ]
    });
  }

  const mode = await select({
    message: "What would you like to do?",
    pageSize: 99,
    theme: {
      helpMode: "always",
    },
    choices: formatChoices(displayChoices),
  });

  switch (mode) {
    case "last-command":
      // This shouldn't happen
      if (lastCommandValue) {
        runCommand(lastCommandValue);
      }
      return;
    case "gen-component":
      const generatedFiles2 = await generateComponent();
      console.log("\nGenerated files:");
      generatedFiles2.forEach((file) => console.log(`- ${file}`));
      await enhanceWithAI(generatedFiles2);
      return;
    case "prisma-db-reset":
      runCommand("pnpm prisma migrate reset");
      return;
    case "checks":
      await handleChecksMode();
      return;
    case "prisma-db-push":
      runCommand("pnpm prisma db push");
      return;
    case "prisma-migrate":
      runCommand("pnpm prisma migrate dev");
      return;
    case "prisma-seed":
      runCommand("pnpm prisma db seed");
      return;
    case "translations":
      runCommand("pnpm inlang machine translate --project project.inlang");
      return;
    case "e2e-debug":
      await playwrightDebug();
      return;
    case "gen-form":
      const generatedFiles = await generateForm();
      console.log("\nGenerated files:");
      generatedFiles.forEach((file) => console.log(`- ${file}`));
      await enhanceWithAI(generatedFiles);
      return;
    case "gen-page":
      const pageFiles = await generatePage();
      console.log("\nGenerated files:");
      pageFiles.forEach((file) => console.log(`- ${file}`));
      await enhanceWithAI(pageFiles);
      return;
    case "e2e-tests":
      runCommand("pnpm playwright codegen localhost:5173");
      return;
    case "prisma-better-auth":
      runCommand(
        "pnpm @better-auth/cli generate --config app/Auth/services/better-auth.server.ts --output ./app/Core/services/prisma/auth-reference.schema.prisma",
      );
      return;
    default:
      console.log("Code generation features coming soon! ", mode);
      return;
  }
}
