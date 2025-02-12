import { CheckSettings } from "../check/check-list";
import { stdout } from "process";
import { checkList } from "../check/check-list";

export interface Column {
  content: string;
  width: number;
}

export function formatTableRow(
  columns: Column[],
  terminalWidth: number,
): string {
  let currentWidth = 0;
  const visibleColumns: Column[] = [];
  const separator = " │ ";

  for (const column of columns) {
    const newWidth =
      currentWidth +
      column.width +
      (visibleColumns.length > 0 ? separator.length : 0);
    if (newWidth <= terminalWidth) {
      visibleColumns.push(column);
      currentWidth = newWidth;
    } else {
      break;
    }
  }

  if (visibleColumns.length === 0) return "";

  return visibleColumns
    .map((col) => col.content.padEnd(col.width))
    .join(separator);
}

export function getMaxColumnWidths(checks: CheckSettings[]) {
  return {
    name: Math.max(...checks.map((check) => check.name.length)),
    alias: Math.max(
      ...checks.map((check) => {
        const alias = getAliasString(check);
        return alias ? `(${alias})`.length : 0;
      }),
    ),
    description: Math.max(...checks.map((check) => check.description.length)),
  };
}

export function getAliasString(check: CheckSettings) {
  if (!check.alias) return "";
  return Array.isArray(check.alias) ? check.alias.join(", ") : check.alias;
}

export function formatCheckName(check: CheckSettings) {
  const terminalWidth = stdout.columns || 80;
  const alias = getAliasString(check);
  const maxWidths = getMaxColumnWidths(checkList);

  const columns: Column[] = [
    { content: check.name, width: maxWidths.name },
    { content: alias ? `(${alias})` : "", width: maxWidths.alias },
    { content: check.description, width: maxWidths.description },
  ];

  return formatTableRow(columns, terminalWidth);
}
