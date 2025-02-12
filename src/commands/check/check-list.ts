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
    subChecks: ["check:style", "check:types", "check:unused-code"],
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
    action: () => runCommand("npx tsc"),
    actionCi: () => runCommand("npx tsc"),
  },
  {
    name: "check:unused-code",
    description: "Checks for unused code",
    alias: "check:knip",
    subChecks: [],
    action: () => runCommand("npx knip --fix"),
    actionCi: () => runCommand("npx knip"),
  },
  {
    name: "check:tests",
    description: "Runs unit tests",
    alias: "check:vitest",
    subChecks: [],
    action: () => runCommand("npx vitest run"),
    actionCi: () => runCommand("npx vitest run"),
  },
  {
    name: "check:e2e",
    description: "End to end tests",
    alias: "check:playwright",
    subChecks: [],
    action: () => runCommand("npx playwright test"),
    actionCi: () => runCommand("npx playwright test"),
  },
  {
    name: "check:lint",
    description: "Runs biome linting",
    subChecks: [],
    action: () => runCommand("npx biome lint --write"),
    actionCi: () => runCommand("npx biome lint"),
  },
  {
    name: "check:format",
    description: "Runs biome formatting",
    subChecks: [],
    action: () => runCommand("npx biome format --write"),
    actionCi: () => runCommand("npx biome format"),
  },
  {
    name: "check:imports",
    description: "Runs biome import organizing",
    subChecks: [],
    action: () =>
      runCommand(
        "biome check --formatter-enabled=false --linter-enabled=false --organize-imports-enabled=true --write",
      ),
    actionCi: () =>
      runCommand(
        "biome check --formatter-enabled=false --linter-enabled=false --organize-imports-enabled=true",
      ),
  },
];
