// @ts-expect-error This works, so not sure why typescript is complaining
import Conf from "conf";

// The type for the config store
interface ConfigStore {
  lastCommands: Record<string, string>; // project path -> command value
}

const config = new Conf<ConfigStore>({
  projectName: "layermix-cli",
  schema: {
    lastCommands: {
      type: "object",
      default: {},
    },
  },
});

function getProjectKey(): string {
  // Using the full path as a key is more robust than just the basename
  // in case of projects with the same directory name.
  return process.cwd();
}

export function setLastCommand(command: string): void {
  const projectKey = getProjectKey();
  config.set(`lastCommands.${projectKey}`, command);
}

export function getLastCommand(): string | undefined {
  const projectKey = getProjectKey();
  return config.get(`lastCommands.${projectKey}`);
}
