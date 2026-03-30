/**
 * Example: GraphQL editor with syntax highlighting and auto-editing
 *
 * Uses the official graphql package's Lexer for tokenization.
 * Transform provides auto-closing brackets/parens and auto-indentation.
 *
 * Run: npx tsx examples/graphql-editor.ts
 */
import { Lexer, Source, TokenKind } from "graphql";

import type { TransformEvent, TransformState } from "../src/index.js";
import { readMultiline } from "../src/index.js";

// ANSI color helpers
const RESET = "\x1b[0m";
const BLUE = "\x1b[34m"; // keywords
const CYAN = "\x1b[36m"; // type names (capitalized)
const GREEN = "\x1b[32m"; // strings
const BRIGHT_YELLOW = "\x1b[93m"; // numbers
const YELLOW = "\x1b[33m"; // braces {}
const DIM_YELLOW = "\x1b[2;33m"; // parens (), brackets []
const MAGENTA = "\x1b[35m"; // variables ($)
const DIM = "\x1b[90m"; // comments, punctuation

const GQL_KEYWORDS = new Set([
  "query",
  "mutation",
  "subscription",
  "fragment",
  "on",
  "type",
  "input",
  "enum",
  "interface",
  "union",
  "scalar",
  "extend",
  "schema",
  "directive",
  "implements",
  "true",
  "false",
  "null",
]);

function highlight(line: string): string {
  // Handle comment lines
  if (line.trimStart().startsWith("#")) {
    return `${DIM}${line}${RESET}`;
  }

  try {
    const source = new Source(line);
    const lexer = new Lexer(source);
    let result = "";
    let pos = 0;

    let token = lexer.advance();
    while (token.kind !== TokenKind.EOF) {
      // Preserve whitespace between tokens
      if (token.start > pos) {
        result += line.slice(pos, token.start);
      }

      const text = line.slice(token.start, token.end);
      switch (token.kind) {
        case TokenKind.NAME:
          if (GQL_KEYWORDS.has(text)) {
            result += `${BLUE}${text}${RESET}`;
          } else if (text[0] === text[0].toUpperCase()) {
            result += `${CYAN}${text}${RESET}`;
          } else {
            result += text;
          }
          break;
        case TokenKind.INT:
        case TokenKind.FLOAT:
          result += `${BRIGHT_YELLOW}${text}${RESET}`;
          break;
        case TokenKind.STRING:
        case TokenKind.BLOCK_STRING:
          result += `${GREEN}${text}${RESET}`;
          break;
        case TokenKind.DOLLAR:
          // Color $ and the following name together as a variable
          result += `${MAGENTA}${text}${RESET}`;
          break;
        case TokenKind.BRACE_L:
        case TokenKind.BRACE_R:
          result += `${YELLOW}${text}${RESET}`;
          break;
        case TokenKind.PAREN_L:
        case TokenKind.PAREN_R:
        case TokenKind.BRACKET_L:
        case TokenKind.BRACKET_R:
          result += `${DIM_YELLOW}${text}${RESET}`;
          break;
        case TokenKind.BANG:
        case TokenKind.COLON:
        case TokenKind.EQUALS:
        case TokenKind.PIPE:
        case TokenKind.AT:
        case TokenKind.AMP:
        case TokenKind.SPREAD:
          result += `${DIM}${text}${RESET}`;
          break;
        default:
          result += text;
      }

      pos = token.end;
      token = lexer.advance();
    }

    // Append any remaining text
    if (pos < line.length) {
      result += line.slice(pos);
    }

    return result;
  } catch {
    // If lexer fails on partial input, return line as-is
    return line;
  }
}

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
      // Bracket expansion: { | } -> {\n  ...\n}
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

console.log(
  "GraphQL Editor (highlighting via graphql Lexer, auto-indent + auto-close brackets):\n",
);

const [_gql, error] = await readMultiline("", {
  prefix: "gql> ",
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
