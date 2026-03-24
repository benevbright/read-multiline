/**
 * Example: auto-editing with the transform option
 *
 * Demonstrates auto-closing brackets and auto-indentation on newline.
 * Combined with highlight for a complete editor-like experience.
 *
 * Run: npx tsx examples/transform.ts
 */
import type { TransformEvent, TransformState } from "../src/index.js";
import { readMultiline } from "../src/index.js";

const BRACKET_PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

function transform(state: TransformState, event: TransformEvent): TransformState | undefined {
  const { lines, row, col } = state;

  // Auto-close brackets: ( -> (), [ -> [], { -> {}
  if (event.type === "insert" && event.char in BRACKET_PAIRS) {
    const close = BRACKET_PAIRS[event.char];
    const line = lines[row];
    const newLine = line.slice(0, col) + close + line.slice(col);
    return { lines: lines.with(row, newLine), row, col };
  }

  // Skip over closing bracket if it matches what was just typed
  if (event.type === "insert" && CLOSE_BRACKETS.has(event.char)) {
    const line = lines[row];
    // The char was already inserted at col-1, check if there's a duplicate at col
    if (line[col] === event.char) {
      const newLine = line.slice(0, col) + line.slice(col + 1);
      return { lines: lines.with(row, newLine), row, col };
    }
  }

  // Auto-indent on newline: inherit previous line's indentation
  // If previous line ends with {, add extra indent; if current line starts with }, dedent
  if (event.type === "newline" && row > 0) {
    const prevLine = lines[row - 1];
    const baseIndent = prevLine.match(/^(\s*)/)?.[1] ?? "";
    const endsWithOpen = prevLine.trimEnd().endsWith("{");
    const startsWithClose = lines[row].trimStart().startsWith("}");

    if (endsWithOpen && startsWithClose) {
      // Bracket expansion: { | } -> {\n  indent\n}
      const innerIndent = baseIndent + "  ";
      const newLines = [...lines];
      newLines[row] = innerIndent;
      newLines.splice(row + 1, 0, baseIndent + lines[row].trimStart());
      return { lines: newLines, row, col: innerIndent.length };
    } else if (endsWithOpen) {
      const indent = baseIndent + "  ";
      return { lines: lines.with(row, indent + lines[row]), row, col: indent.length };
    } else if (baseIndent && col === 0) {
      return { lines: lines.with(row, baseIndent + lines[row]), row, col: baseIndent.length };
    }
  }

  return undefined;
}

// Simple highlight to make brackets and indentation visible
function highlight(line: string): string {
  return line
    .replace(/[{}[\]()]/g, "\x1b[33m$&\x1b[0m") // yellow brackets
    .replace(/\b(function|const|let|var|if|else|return|for)\b/g, "\x1b[34m$&\x1b[0m"); // blue keywords
}

console.log("Editor with auto-closing brackets and auto-indentation:");
console.log("  - Type ( [ { to see auto-closing");
console.log("  - Press Enter after { to see auto-indent + bracket expansion\n");

const [code, error] = await readMultiline("", {
  prefix: "edit> ",
  linePrefix: "    | ",
  highlight,
  transform,
  preferNewlineOnEnter: true,
  helpFooter: true,
});

if (error) {
  console.log(`\n(${error.kind})`);
} else {
  console.log("\n--- Result ---");
  console.log(code);
}
