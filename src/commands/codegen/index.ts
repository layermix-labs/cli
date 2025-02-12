import { Command } from "commander";
import { CommandRegistrar } from "../types";

export class CodegenCommands implements CommandRegistrar {
  register(program: Command): void {
    program
      .command("codegen")
      .description("Code generation commands")
      .action(() => {
        console.log("Code generation features coming soon!");
      });
  }
}
