import { Command } from "commander";

export interface CommandRegistrar {
  register: (program: Command) => void;
}
