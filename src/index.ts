#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("layermix")
  .description("CLI tool for layermix framework")
  .version("1.0.0");

// Add subcommands here later
program
  .command("hello")
  .description("Test command")
  .action(() => {
    console.log("Hello from Layermix CLI!");
  });

program.parse();
