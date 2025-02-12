#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("layermix")
  .description("CLI tool for layermix framework")
  .version("1.0.0");

import { execSync } from "child_process";

const runCommand = (command: string) => {
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    process.exit(1);
  }
};

// Combined checks
program
  .command("check")
  .description("Runs all the checks")
  .action(() => {
    runCommand(
      "yarn biome check --write && yarn tsc && yarn knip && yarn vitest run && yarn playwright test",
    );
  });

program
  .command("check:static")
  .description("Runs biome, types and unused-code")
  .action(() => {
    runCommand("yarn biome check --write && yarn tsc && yarn knip");
  });

program
  .command("check:style")
  .alias("check:biome")
  .description("Runs all biome checks")
  .action(() => {
    runCommand("yarn biome check --write");
  });

// Individual checks
program
  .command("check:types")
  .alias("check:tsc")
  .description("Type checking")
  .action(() => {
    runCommand("yarn tsc");
  });

program
  .command("check:unused-code")
  .alias("check:knip")
  .description("Checks for unused code")
  .action(() => {
    runCommand("yarn knip");
  });

program
  .command("check:tests")
  .alias("check:vitest")
  .description("Runs unit tests")
  .action(() => {
    runCommand("yarn vitest run");
  });

program
  .command("check:e2e")
  .alias("check:playwright")
  .description("End to end tests")
  .action(() => {
    runCommand("yarn playwright test");
  });

program
  .command("check:lint")
  .description("Runs biome linting")
  .action(() => {
    runCommand("yarn biome lint --write");
  });

program
  .command("check:format")
  .description("Runs biome formatting")
  .action(() => {
    runCommand("yarn biome format --write");
  });

program
  .command("check:imports")
  .description("Runs biome import organizing")
  .action(() => {
    runCommand(
      "biome check --formatter-enabled=false --linter-enabled=false --organize-imports-enabled=true --write",
    );
  });

program.parse();
