import { checkbox } from "@inquirer/prompts";
import { checkList } from "../check/check-list";
import { executeChecks } from "../check/execute-checks";
import { formatCheckName } from "./table-formatter";

export async function handleChecksMode() {
  const checkOptions = checkList
    .filter((check) => check.action || check.actionCi)
    .map((check) => ({
      name: formatCheckName(check),
      message: check.description,
      value: check,
      short: check.name,
    }));

  const selected = await checkbox({
    message: "Select checks to run",
    choices: checkOptions,
  });

  executeChecks(selected);
}
