/**
 * Example: SQL editor with syntax highlighting and auto-editing
 *
 * Uses sql-highlight for tokenization and ANSI output.
 * Transform provides auto-closing parentheses and auto-indentation.
 *
 * Run: npx tsx examples/sql-editor.ts
 */
import { highlight as sqlHighlight } from "sql-highlight";

import type { TransformEvent, TransformState } from "../src/index.js";
import { readMultiline } from "../src/index.js";

function highlight(line: string): string {
  return sqlHighlight(line);
}

function transform(state: TransformState, event: TransformEvent): TransformState | undefined {
  const { lines, row, col } = state;

  // Auto-close parentheses
  if (event.type === "insert" && event.char === "(") {
    const line = lines[row];
    const newLine = line.slice(0, col) + ")" + line.slice(col);
    return { lines: lines.with(row, newLine), row, col };
  }

  // Skip over closing paren if it matches
  if (event.type === "insert" && event.char === ")") {
    const line = lines[row];
    if (line[col] === ")") {
      const newLine = line.slice(0, col) + line.slice(col + 1);
      return { lines: lines.with(row, newLine), row, col };
    }
  }

  // Auto-indent on newline: inherit indentation, add extra after SQL clause keywords
  if (event.type === "newline" && row > 0) {
    const prevLine = lines[row - 1];
    const baseIndent = prevLine.match(/^(\s*)/)?.[1] ?? "";
    const trimmed = prevLine.trimEnd().toUpperCase();
    const needsIndent =
      trimmed.endsWith("(") ||
      /\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|SET|VALUES|GROUP BY|ORDER BY|HAVING|UNION|UNION ALL|CASE|WHEN|THEN|ELSE)\s*$/i.test(
        prevLine.trimEnd(),
      );

    if (needsIndent) {
      const indent = baseIndent + "  ";
      return { lines: lines.with(row, indent + lines[row]), row, col: indent.length };
    } else if (baseIndent && col === 0) {
      return { lines: lines.with(row, baseIndent + lines[row]), row, col: baseIndent.length };
    }
  }

  return undefined;
}

console.log("SQL Editor (highlighting via sql-highlight, auto-indent + auto-close parens):\n");

const [_sql, error] = await readMultiline("", {
  prefix: "sql> ",
  linePrefix: "   | ",
  highlight,
  transform,
  preferNewlineOnEnter: true,
  helpFooter: true,
  theme: { submitRender: "content" },
});

if (error) {
  console.log(`\n(${error.kind})`);
}
