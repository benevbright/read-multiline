/**
 * Example: GraphQL editor with semantic highlighting via graphql-language-service-parser
 *
 * Unlike the Lexer-based graphql-editor.ts, this uses the "online parser"
 * from graphql-language-service-parser which provides semantic token types:
 *   keyword, def (operation name), property (field), qualifier (aliased field name),
 *   attribute (argument name), variable ($var), atom (type name), etc.
 *
 * The online parser is stateful and fault-tolerant -- it works with incomplete
 * input while the user is typing, just like GraphiQL and VS Code.
 *
 * After submission, the result is printed with highlighting applied.
 *
 * Run: npx tsx examples/graphql-semantic-editor.ts
 */
import pkg from "graphql-language-service-parser";

import type { TransformEvent, TransformState } from "../src/index.js";
import { readMultiline } from "../src/index.js";

const { CharacterStream, onlineParser } = pkg;

// ANSI color helpers — palette inspired by VS Code Dark+, GraphQL Playground, and GraphiQL
const RESET = "\x1b[0m";
const BLUE = "\x1b[34m"; // keyword, number, builtin (true/false)
const BOLD_CYAN = "\x1b[1;36m"; // def (operation/fragment name)
const BRIGHT_BLUE = "\x1b[94m"; // property/qualifier (field name)
const ITALIC_YELLOW = "\x1b[3;33m"; // attribute (argument name)
const DIM = "\x1b[90m"; // comment, other punctuation
const CYAN = "\x1b[36m"; // atom (type name like ID, String)
const MAGENTA = "\x1b[35m"; // variable ($id)
const BOLD_MAGENTA = "\x1b[1;35m"; // meta (directive @skip, @deprecated)
const GREEN = "\x1b[32m"; // string, enum values
const RED = "\x1b[91m"; // invalidchar
const YELLOW = "\x1b[33m"; // braces {}
const DIM_YELLOW = "\x1b[2;33m"; // parens (), brackets []

const STYLE_MAP: Record<string, string> = {
  keyword: BLUE,
  def: BOLD_CYAN,
  property: BRIGHT_BLUE,
  qualifier: BRIGHT_BLUE,
  attribute: ITALIC_YELLOW,
  variable: MAGENTA,
  atom: CYAN,
  meta: BOLD_MAGENTA,
  number: BLUE,
  string: GREEN,
  "string-2": GREEN, // enum values, block strings
  builtin: BLUE, // true, false
  comment: DIM,
  invalidchar: RED,
  punctuation: "",
};

const BRACE_CHARS = new Set(["{", "}"]);
const PAREN_CHARS = new Set(["(", ")", "[", "]"]);

/** Highlight lines using the stateful online parser */
function highlightLines(lines: string[]): string[] {
  const parser = onlineParser();
  const state = parser.startState();
  const result: string[] = [];

  for (const line of lines) {
    const stream = new CharacterStream(line);
    let highlighted = "";

    while (!stream.eol()) {
      const style = parser.token(stream, state);
      const text = stream.current();

      if (style === "ws") {
        highlighted += text;
      } else if (style === "punctuation" && BRACE_CHARS.has(text)) {
        highlighted += YELLOW + text + RESET;
      } else if (style === "punctuation" && PAREN_CHARS.has(text)) {
        highlighted += DIM_YELLOW + text + RESET;
      } else if (style && style in STYLE_MAP && STYLE_MAP[style]) {
        highlighted += STYLE_MAP[style] + text + RESET;
      } else if (style === "punctuation") {
        highlighted += DIM + text + RESET;
      } else {
        highlighted += text;
      }
    }

    result.push(highlighted);
  }

  return result;
}

/** Per-line highlight callback for readMultiline.
 *  Tracks lines from _line parameters and transform results.
 *  Re-parses all lines when any change is detected. */
let highlightCache: string[] = [];
let cachedSource = "";
let trackedLines: string[] = [""];

function highlight(_line: string, lineIndex: number): string {
  // Sync tracked lines with actual state from _line parameter
  while (trackedLines.length <= lineIndex) trackedLines.push("");
  trackedLines[lineIndex] = _line;

  const source = trackedLines.join("\n");
  if (source !== cachedSource) {
    cachedSource = source;
    highlightCache = highlightLines(trackedLines);
  }
  return highlightCache[lineIndex] ?? _line;
}

/** Update tracked lines from transform result (handles line count changes) */
function syncLines(lines: string[]): void {
  trackedLines.length = 0;
  trackedLines.push(...lines);
  cachedSource = ""; // invalidate cache
}

// --- Transform ---

const BRACKET_PAIRS: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

function transform(state: TransformState, event: TransformEvent): TransformState | undefined {
  const { lines, row, col } = state;

  // Auto-close brackets
  if (event.type === "insert" && event.char in BRACKET_PAIRS) {
    const close = BRACKET_PAIRS[event.char];
    const line = lines[row];
    const newLine = line.slice(0, col) + close + line.slice(col);
    return { lines: lines.with(row, newLine), row, col };
  }

  // Skip over closing bracket if it matches
  if (event.type === "insert" && CLOSE_BRACKETS.has(event.char)) {
    const line = lines[row];
    if (line[col] === event.char) {
      const newLine = line.slice(0, col) + line.slice(col + 1);
      return { lines: lines.with(row, newLine), row, col };
    }
  }

  // Auto-indent on newline
  if (event.type === "newline" && row > 0) {
    const prevLine = lines[row - 1];
    const baseIndent = prevLine.match(/^(\s*)/)?.[1] ?? "";
    const endsWithOpen = /[{([]$/.test(prevLine.trimEnd());
    const startsWithClose = /^[}\])]/.test(lines[row].trimStart());

    if (endsWithOpen && startsWithClose) {
      // Bracket expansion: { | } → {\n  ...\n}
      const innerIndent = baseIndent + "  ";
      const newLines = [...lines];
      newLines[row] = innerIndent;
      newLines.splice(row + 1, 0, baseIndent + lines[row].trimStart());
      return { lines: newLines, row, col: innerIndent.length };
    } else if (endsWithOpen) {
      // Auto-insert closing bracket on next line
      const openChar = prevLine.trimEnd().slice(-1);
      const closeChar = BRACKET_PAIRS[openChar] ?? "}";
      const indent = baseIndent + "  ";
      const newLines = [...lines];
      newLines[row] = indent + lines[row];
      newLines.splice(row + 1, 0, baseIndent + closeChar);
      return { lines: newLines, row, col: indent.length };
    } else if (baseIndent && col === 0) {
      return { lines: lines.with(row, baseIndent + lines[row]), row, col: baseIndent.length };
    }
  }

  return undefined;
}

// --- Main ---

console.log("GraphQL Semantic Editor (online parser, fault-tolerant highlighting):");
console.log(
  "  keyword=blue  def=bold-cyan  field=bright-blue  arg=italic-yellow  type=cyan  var=magenta  directive=bold-magenta\n",
);

const [_gql, error] = await readMultiline("", {
  prefix: "gql> ",
  linePrefix: "   | ",
  highlight,
  transform(state, event) {
    const result = transform(state, event);
    syncLines(result ? result.lines : state.lines);
    return result;
  },
  preferNewlineOnEnter: true,
  helpFooter: true,
  theme: { submitRender: "content" },
});

if (error) {
  console.log(`\n(${error.kind})`);
}
