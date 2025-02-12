import { select, checkbox } from "@inquirer/prompts";
import { stdout } from "process";
import { checkList, CheckSettings } from "../check/check-list";
import { executeChecks } from "../check/execute-checks";
import { runCommand } from "../../utils/exec";

export async function handleInteractiveMode() {
  const mode = await select({
    message: "What would you like to do?",
    choices: [
      { value: "checks", name: "Run Checks" },
      { value: "codegen", name: "Generate Code" },
    ],
  });

  if (mode === "checks") {
    const checkOptions = checkList
      .filter((check) => check.action || check.actionCi)
      .map((check) => ({
        name: getName(check),
        message: check.description,
        value: check,
        short: check.name,
      }));

    const selected = await checkbox({
      message: "Select checks to run",
      choices: checkOptions,
    });

    executeChecks(selected);
  } else if (mode === "codegen") {
    const codeGenMode = await select({
      message: "What would you like to generate?",
      choices: [
        { value: "form", name: "Functionality: Form" },
        { value: "page", name: "Functionality: Page + Form + Action + Schema" },
        {
          value: "better-auth-prisma",
          name: "Better Auth Prisma Reference Schema",
        },
      ],
    });
    if (codeGenMode === "better-auth-prisma") {
      runCommand(
        "npx @better-auth/cli generate --config app/Auth/services/better-auth.server.ts --output ./app/Core/services/prisma/auth-reference.schema.prisma",
      );
    }
    console.log("Code generation features coming soon! ", codeGenMode);
  }
}

interface Column {
  content: string;
  width: number;
}

function formatTableRow(columns: Column[], terminalWidth: number): string {
  let currentWidth = 0;
  const visibleColumns: Column[] = [];
  const separator = " │ ";

  // Add columns that fit within terminal width
  for (const column of columns) {
    const newWidth =
      currentWidth +
      column.width +
      (visibleColumns.length > 0 ? separator.length : 0);
    if (newWidth <= terminalWidth) {
      visibleColumns.push(column);
      currentWidth = newWidth;
    } else {
      break;
    }
  }

  if (visibleColumns.length === 0) return "";

  return visibleColumns
    .map((col) => col.content.padEnd(col.width))
    .join(separator);
}

function getMaxAliasWidth(checks: CheckSettings[]): number {
  return Math.max(
    ...checks.map((check) => {
      const alias = getAliasString(check);
      return alias ? `(${alias})`.length : 0;
    }),
  );
}

function getName(check: CheckSettings) {
  const terminalWidth = stdout.columns || 80;
  const alias = getAliasString(check);
  const maxAliasWidth = getMaxAliasWidth(checkList);

  const columns: Column[] = [
    { content: check.name, width: 20 },
    { content: alias ? `(${alias})` : "", width: maxAliasWidth },
    { content: check.description, width: 40 },
  ];

  return formatTableRow(columns, terminalWidth);
}

function getAliasString(check: CheckSettings) {
  if (!check.alias) return "";
  return Array.isArray(check.alias) ? check.alias.join(", ") : check.alias;
}
