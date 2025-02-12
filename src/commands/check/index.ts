import { Command } from "commander";
import { CommandRegistrar } from "../types";
import { checkList } from "./check-list";
import { executeChecks } from "./execute-checks";

export class CheckCommands implements CommandRegistrar {
  register(program: Command): void {
    checkList.forEach((check) => {
      const command = program
        .command(check.name)
        .description(check.description)
        .option("--ci", "Run in CI mode");

      if (check.alias) {
        if (Array.isArray(check.alias)) {
          check.alias.forEach((alias) => command.alias(alias));
        } else {
          command.alias(check.alias);
        }
      }

      command.action((options) => {
        executeChecks([check], options.ci);
      });
    });
  }
}
