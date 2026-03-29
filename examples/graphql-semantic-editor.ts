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

// ANSI color helpers
const RESET = "\x1b[0m";
const BLUE = "\x1b[34m"; // keyword (query, mutation, fragment, etc.)
const BOLD_BLUE = "\x1b[1;34m"; // def (operation/fragment name)
const WHITE = "\x1b[97m"; // property (field name)
const ITALIC = "\x1b[3m"; // qualifier (aliased field name)
const DIM = "\x1b[90m"; // attribute (argument name), punctuation
const CYAN = "\x1b[36m"; // atom (type name like ID, String)
const MAGENTA = "\x1b[35m"; // variable ($id)
const GREEN = "\x1b[32m"; // string
const YELLOW = "\x1b[33m"; // number
const RED = "\x1b[91m"; // invalidchar
const BRACKET = "\x1b[33m"; // brackets/braces/parens

const STYLE_MAP: Record<string, string> = {
  keyword: BLUE,
  def: BOLD_BLUE,
  property: WHITE,
  qualifier: ITALIC,
  attribute: DIM,
  variable: MAGENTA,
  atom: CYAN,
  number: YELLOW,
  string: GREEN,
  "string-2": GREEN, // block strings
  builtin: CYAN,
  comment: DIM,
  invalidchar: RED,
  punctuation: "",
};

const BRACKET_CHARS = new Set(["{", "}", "(", ")", "[", "]"]);

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
      } else if (style === "punctuation" && BRACKET_CHARS.has(text)) {
        highlighted += BRACKET + text + RESET;
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
 *  Re-parses all lines on each call to line 0 (start of render pass),
 *  then returns cached results for subsequent lines. */
let highlightCache: string[] = [];
let cachedSource = "";

function highlight(lines: string[]): (line: string, lineIndex: number) => string {
  return (_line: string, lineIndex: number): string => {
    const source = lines.join("\n");
    if (source !== cachedSource) {
      cachedSource = source;
      highlightCache = highlightLines(lines);
    }
    return highlightCache[lineIndex] ?? _line;
  };
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

// --- Main ---

console.log("GraphQL Semantic Editor (online parser, fault-tolerant highlighting):");
console.log(
  "  keyword=blue  def=bold-blue  field=white  alias=italic  arg=dim  type=cyan  var=magenta\n",
);

// Track editor lines for the highlight closure
const editorLines: string[] = [""];
const highlighter = highlight(editorLines);

const [gql, error] = await readMultiline("", {
  prefix: "gql> ",
  linePrefix: "   | ",
  highlight: highlighter,
  transform(state, event) {
    editorLines.length = 0;
    editorLines.push(...state.lines);
    return transform(state, event);
  },
  preferNewlineOnEnter: true,
  helpFooter: true,
});

if (error) {
  console.log(`\n(${error.kind})`);
} else {
  // Print result with highlighting preserved
  console.log("\n--- GraphQL ---");
  const highlighted = highlightLines(gql.split("\n"));
  for (const line of highlighted) {
    console.log(line);
  }
}
