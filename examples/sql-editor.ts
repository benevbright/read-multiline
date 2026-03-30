/**
 * Example: SQL editor with syntax highlighting and auto-editing
 *
 * Uses sql-highlight's getSegments for tokenization with custom ANSI colors.
 * Transform provides auto-closing parentheses and auto-indentation.
 *
 * Run: npx tsx examples/sql-editor.ts
 */
import { getSegments } from "sql-highlight";

import type { TransformEvent, TransformState } from "../src/index.js";
import { readMultiline } from "../src/index.js";

// ANSI color helpers
const RESET = "\x1b[0m";
const BLUE = "\x1b[34m"; // keyword
const MAGENTA = "\x1b[35m"; // function (COUNT, COALESCE, etc.)
const YELLOW = "\x1b[33m"; // identifier (table/column names)
const BRIGHT_GREEN = "\x1b[92m"; // string
const CYAN = "\x1b[36m"; // number, boolean
const DIM = "\x1b[90m"; // special (., ,, =, >, etc.)
const DIM_YELLOW = "\x1b[2;33m"; // bracket (, )

const STYLE_MAP: Record<string, string> = {
  keyword: BLUE,
  function: MAGENTA,
  identifier: YELLOW,
  string: BRIGHT_GREEN,
  number: CYAN,
  bracket: DIM_YELLOW,
  special: DIM,
};

function highlight(line: string): string {
  const segments = getSegments(line);
  let result = "";
  for (const seg of segments) {
    const style = STYLE_MAP[seg.name];
    result += style ? style + seg.content + RESET : seg.content;
  }
  return result;
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
    const needsIndent =
      prevLine.trimEnd().endsWith("(") ||
      /\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|SET|VALUES|GROUP BY|ORDER BY|HAVING|UNION|UNION ALL|CASE|WHEN|THEN|ELSE)\s*$/i.test(
        prevLine.trimEnd(),
      );

    const startsWithClose = /^\s*\)/.test(lines[row]);

    if (prevLine.trimEnd().endsWith("(") && startsWithClose) {
      // Paren expansion: ( | ) → (\n  ...\n)
      const innerIndent = baseIndent + "  ";
      const newLines = [...lines];
      newLines[row] = innerIndent;
      newLines.splice(row + 1, 0, baseIndent + lines[row].trimStart());
      return { lines: newLines, row, col: innerIndent.length };
    } else if (prevLine.trimEnd().endsWith("(")) {
      // Auto-insert closing paren on next line
      const indent = baseIndent + "  ";
      const newLines = [...lines];
      newLines[row] = indent + lines[row];
      newLines.splice(row + 1, 0, baseIndent + ")");
      return { lines: newLines, row, col: indent.length };
    } else if (needsIndent) {
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
