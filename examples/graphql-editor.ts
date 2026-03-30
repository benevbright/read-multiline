/**
 * Example: GraphQL editor with syntax highlighting and auto-editing
 *
 * Uses the official graphql package's Lexer for tokenization with
 * context tracking (paren depth, previous token) to provide semantic-level
 * coloring: keywords, def names, field names, argument names, types,
 * variables, directives, etc.
 *
 * Transform provides auto-closing brackets/parens and auto-indentation.
 *
 * Run: npx tsx examples/graphql-editor.ts
 */
import { Lexer, Source, TokenKind } from "graphql";

import type { TransformEvent, TransformState } from "../src/index.js";
import { readMultiline } from "../src/index.js";

// ANSI color helpers — same palette as graphql-semantic-editor
const RESET = "\x1b[0m";
const BLUE = "\x1b[34m"; // keyword, number, builtin (true/false)
const BOLD_CYAN = "\x1b[1;36m"; // def (operation/fragment name)
const BRIGHT_BLUE = "\x1b[94m"; // field name
const ITALIC_YELLOW = "\x1b[3;33m"; // argument name
const CYAN = "\x1b[36m"; // type name
const MAGENTA = "\x1b[35m"; // variable ($)
const BOLD_MAGENTA = "\x1b[1;35m"; // directive (@)
const GREEN = "\x1b[32m"; // string
const DIM = "\x1b[90m"; // comment, punctuation
const YELLOW = "\x1b[33m"; // braces {}
const DIM_YELLOW = "\x1b[2;33m"; // parens (), brackets []

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
]);

// Keywords that introduce a definition name (next NAME is the def)
const DEF_KEYWORDS = new Set(["query", "mutation", "subscription", "fragment"]);

const BUILTINS = new Set(["true", "false", "null"]);

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

    // Context tracking
    let parenDepth = 0; // inside (...) for argument detection
    let prevKind: string = ""; // previous token kind
    let prevText = ""; // previous token text
    let afterColon = false; // next NAME is a type

    let token = lexer.advance();
    while (token.kind !== TokenKind.EOF) {
      // Preserve whitespace between tokens
      if (token.start > pos) {
        result += line.slice(pos, token.start);
      }

      const text = line.slice(token.start, token.end);
      switch (token.kind) {
        case TokenKind.NAME: {
          if (prevKind === TokenKind.DOLLAR) {
            // $name → variable (continuation of $)
            result += `${MAGENTA}${text}${RESET}`;
          } else if (prevKind === TokenKind.AT) {
            // @name → directive name
            result += `${BOLD_MAGENTA}${text}${RESET}`;
          } else if (BUILTINS.has(text)) {
            result += `${BLUE}${text}${RESET}`;
          } else if (GQL_KEYWORDS.has(text)) {
            result += `${BLUE}${text}${RESET}`;
          } else if (DEF_KEYWORDS.has(prevText)) {
            // Name right after query/mutation/subscription/fragment → def name
            result += `${BOLD_CYAN}${text}${RESET}`;
          } else if (afterColon) {
            // After : → type name
            result += `${CYAN}${text}${RESET}`;
          } else if (parenDepth > 0) {
            // Inside parens, not after colon → argument name
            result += `${ITALIC_YELLOW}${text}${RESET}`;
          } else {
            // Default: field name
            result += `${BRIGHT_BLUE}${text}${RESET}`;
          }
          afterColon = false;
          break;
        }
        case TokenKind.INT:
        case TokenKind.FLOAT:
          result += `${BLUE}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.STRING:
        case TokenKind.BLOCK_STRING:
          result += `${GREEN}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.DOLLAR:
          result += `${MAGENTA}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.AT:
          result += `${BOLD_MAGENTA}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.BRACE_L:
        case TokenKind.BRACE_R:
          result += `${YELLOW}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.PAREN_L:
          parenDepth++;
          result += `${DIM_YELLOW}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.PAREN_R:
          parenDepth = Math.max(0, parenDepth - 1);
          result += `${DIM_YELLOW}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.BRACKET_L:
        case TokenKind.BRACKET_R:
          result += `${DIM_YELLOW}${text}${RESET}`;
          afterColon = false;
          break;
        case TokenKind.COLON:
          result += `${DIM}${text}${RESET}`;
          afterColon = true;
          break;
        case TokenKind.BANG:
        case TokenKind.EQUALS:
        case TokenKind.PIPE:
        case TokenKind.AMP:
        case TokenKind.SPREAD:
          result += `${DIM}${text}${RESET}`;
          afterColon = false;
          break;
        default:
          result += text;
          afterColon = false;
      }

      prevKind = token.kind;
      prevText = text;
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

  // Dedent: backspace at indent-only position removes one indent level (2 spaces)
  if (event.type === "backspace") {
    const line = lines[row];
    const beforeCursor = line.slice(0, col);
    if (beforeCursor.length >= 1 && /^ +$/.test(beforeCursor)) {
      const newIndent = beforeCursor.slice(0, -1);
      const newLine = newIndent + line.slice(col);
      return { lines: lines.with(row, newLine), row, col: newIndent.length };
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
