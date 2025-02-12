#!/usr/bin/env node

import { Command } from "commander";
import { CheckCommands } from "./commands/check";
import { CodegenCommands } from "./commands/codegen";
import { handleInteractiveMode } from "./commands/interactive";

const program = new Command();

program
  .name("layermix")
  .description("CLI tool for layermix framework")
  .version("1.0.0");

// Register command groups
const commandRegistrars = [
  new CheckCommands(),
  new CodegenCommands(),
];

// Register all commands
commandRegistrars.forEach(registrar => registrar.register(program));

// Default action when no command is provided
if (process.argv.length === 2) {
  handleInteractiveMode().catch(console.error);
} else {
  program.parse();
}
