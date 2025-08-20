import { runCommand } from "../../utils/exec";

export type CheckSettings = {
  name: string;
  description: string;
  alias?: string | string[];
  action?: () => void;
  actionCi?: () => void;
  subChecks?: string[];
};

export const checkList: CheckSettings[] = [
  {
    name: "check",
    description: "Runs all the checks",
    subChecks: ["check:static", "check:tests", "check:e2e"],
  },
  {
    name: "check:static",
    description: "Runs biome, types and unused-code",
    subChecks: [
      "check:style",
      "check:types",
      "check:unused-code",
      "check:translations",
    ],
  },
  {
    name: "check:style",
    description: "Runs all biome checks",
    alias: "check:biome",
    subChecks: ["check:lint", "check:format", "check:imports"],
  },
  {
    name: "check:types",
    description: "Type checking",
    alias: "check:tsc",
    subChecks: [],
    action: () => runCommand("pnpm tsc"),
    actionCi: () => runCommand("pnpm tsc"),
  },
  {
    name: "check:unused-code",
    description: "Checks for unused code",
    alias: "check:knip",
    subChecks: [],
    action: () => runCommand("pnpm knip --fix"),
    actionCi: () => runCommand("pnpm knip"),
  },
  {
    name: "check:tests",
    description: "Runs unit tests",
    alias: "check:vitest",
    subChecks: [],
    action: () => runCommand("pnpm vitest run"),
    actionCi: () => runCommand("pnpm vitest run"),
  },
  {
    name: "check:e2e",
    description: "End to end tests",
    alias: "check:playwright",
    subChecks: [],
    action: () => runCommand("pnpm playwright test"),
    actionCi: () => runCommand("pnpm playwright test"),
  },
  {
    name: "check:lint",
    description: "Runs biome linting",
    subChecks: [],
    action: () => runCommand("pnpm biome lint --write"),
    actionCi: () => runCommand("pnpm biome lint"),
  },
  {
    name: "check:format",
    description: "Runs biome formatting",
    subChecks: [],
    action: () => runCommand("pnpm biome format --write"),
    actionCi: () => runCommand("pnpm biome format"),
  },
  {
    name: "check:imports",
    description: "Runs biome import organizing",
    subChecks: [],
    action: () =>
      runCommand(
        "biome check --formatter-enabled=false --linter-enabled=false --write",
      ),
    actionCi: () =>
      runCommand(
        "biome check --formatter-enabled=false --linter-enabled=false",
      ),
  }
];
