import { runCommand } from "../../utils/exec";

type CheckSettings = {
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
    subChecks: [],
  },
  {
    name: "check:static",
    description: "Runs biome, types and unused-code",
    subChecks: [],
  },
  {
    name: "check:style",
    description: "Runs all biome checks",
    alias: "check:biome",
    subChecks: [],
    action: () => runCommand("yarn biome check --write"),
    actionCi: () => runCommand("yarn biome check --write"),
  },
  {
    name: "check:types",
    description: "Type checking",
    alias: "check:tsc",
    subChecks: [],
    action: () => runCommand("yarn tsc"),
    actionCi: () => runCommand("yarn tsc"),
  },
  {
    name: "check:unused-code",
    description: "Checks for unused code",
    alias: "check:knip",
    subChecks: [],
    action: () => runCommand("yarn knip --fix"),
    actionCi: () => runCommand("yarn knip"),
  },
  {
    name: "check:tests",
    description: "Runs unit tests",
    alias: "check:vitest",
    subChecks: [],
    action: () => runCommand("yarn vitest run"),
    actionCi: () => runCommand("yarn vitest run"),
  },
  {
    name: "check:e2e",
    description: "End to end tests",
    alias: "check:playwright",
    subChecks: [],
    action: () => runCommand("yarn playwright test"),
    actionCi: () => runCommand("yarn playwright test"),
  },
  {
    name: "check:lint",
    description: "Runs biome linting",
    subChecks: [],
    action: () => runCommand("yarn biome lint --write"),
    actionCi: () => runCommand("yarn biome lint"),
  },
  {
    name: "check:format",
    description: "Runs biome formatting",
    subChecks: [],
    action: () => runCommand("yarn biome format --write"),
    actionCi: () => runCommand("yarn biome format"),
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
