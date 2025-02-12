import { checkbox } from "@inquirer/prompts";
import { checkList } from "../check/check-list";
import { executeChecks } from "../check/execute-checks";
import { formatChoices, getAliasString } from "./table-formatter";

export async function handleChecksMode() {
  const choices = checkList
    .filter((check) => check.action || check.actionCi)
    .map((check) => ({
      columns: [
        check.name,
        getAliasString(check) ? `(${getAliasString(check)})` : "",
        check.description,
      ],
      value: check,
    }));

  const selected = await checkbox({
    message: "Select checks to run",
    choices: formatChoices(choices),
  });

  executeChecks(selected);
}
