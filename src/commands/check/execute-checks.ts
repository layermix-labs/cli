import { CheckSettings, checkList } from "./check-list";

const findCheckByName = (name: string): CheckSettings | undefined => {
  return checkList.find((check) => check.name === name);
};

const executeCheck = (check: CheckSettings, isCi: boolean) => {
  // Execute subChecks first if they exist
  if (check.subChecks && check.subChecks.length > 0) {
    for (const subCheckName of check.subChecks) {
      const subCheck = findCheckByName(subCheckName);
      if (subCheck) {
        executeCheck(subCheck, isCi);
      }
    }
  }
  
  // Execute the check's own action if it exists
  if (isCi && check.actionCi) {
    check.actionCi();
  } else if (check.action) {
    check.action();
  }
};

export const executeChecks = (checks: CheckSettings[], isCi = false) => {
  for (const check of checks) {
    executeCheck(check, isCi);
  }
};
