import { CheckSettings } from "../check/check-list";
import { stdout } from "process";

export interface Column {
  content: string;
  width: number;
}

export interface TableChoice<T = any> {
  columns: string[];
  value: T;
  disabled?: boolean;
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

export function getMaxColumnWidths<T>(choices: TableChoice<T>[]): number[] {
  const columnCount = Math.max(
    ...choices.map((choice) => choice.columns.length),
  );
  const widths: number[] = [];

  for (let i = 0; i < columnCount; i++) {
    widths[i] = Math.max(
      ...choices.map((choice) => (choice.columns[i] || "").length),
    );
  }

  return widths;
}

export function formatChoices<T>(choices: TableChoice<T>[]): {
  name: string;
  value: T;
  disabled?: boolean;
}[] {
  const terminalWidth = stdout.columns || 80;
  const columnWidths = getMaxColumnWidths(choices);

  return choices.map((choice) => ({
    name: formatTableRow(
      choice.columns.map((content, index) => ({
        content,
        width: columnWidths[index],
      })),
      terminalWidth,
    ),
    value: choice.value,
    disabled: choice.disabled,
  }));
}

// Legacy support for check formatting
export function getAliasString(check: CheckSettings) {
  if (!check.alias) return "";
  return Array.isArray(check.alias) ? check.alias.join(", ") : check.alias;
}
