/**
 * Example: syntax highlighting with the highlight option
 *
 * Demonstrates keyword and string highlighting for a simple JS-like syntax.
 *
 * Run: npx tsx examples/highlight.ts
 */
import { readMultiline } from "../src/index.js";

const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await)\b/g;
const STRINGS = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;
const NUMBERS = /\b(\d+(?:\.\d+)?)\b/g;
const COMMENTS = /(\/\/.*$)/gm;

function highlight(line: string): string {
  // Apply highlighting in order: comments > strings > keywords > numbers
  // Comments override everything on the line
  if (/^\s*\/\//.test(line)) {
    return `\x1b[90m${line}\x1b[0m`;
  }
  return line
    .replace(STRINGS, "\x1b[32m$&\x1b[0m") // green strings
    .replace(KEYWORDS, "\x1b[34m$&\x1b[0m") // blue keywords
    .replace(NUMBERS, "\x1b[33m$&\x1b[0m") // yellow numbers
    .replace(COMMENTS, "\x1b[90m$1\x1b[0m"); // dim comments
}

console.log("Enter some JavaScript (keywords, strings, and numbers are highlighted):\n");

const [code, error] = await readMultiline("", {
  prefix: "js> ",
  linePrefix: "  | ",
  highlight,
  preferNewlineOnEnter: true,
  helpFooter: true,
});

if (error) {
  console.log(`\n(${error.kind})`);
} else {
  console.log("\n--- Result ---");
  console.log(code);
}
