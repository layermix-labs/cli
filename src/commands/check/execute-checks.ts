import { CheckSettings } from "./check-list";

export const executeChecks = (checks: CheckSettings[], isCi = false) => {
  for (const check of checks) {
    if (isCi && check.actionCi) {
      check.actionCi();
    } else if (check.action) {
      check.action();
    }
  }
};
