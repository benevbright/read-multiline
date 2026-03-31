/**
 * Example: syntax highlighting using shiki (VS Code-grade, true color)
 *
 * Uses shiki's tokenizer to produce 24-bit ANSI-colored output.
 * Supports 200+ languages and VS Code themes.
 *
 * Run: npx tsx examples/shiki-highlight.ts
 */
import { createHighlighter } from "shiki";

import { readMultiline } from "../src/index.js";

// Convert hex color (#RRGGBB) to 24-bit ANSI foreground escape sequence
function hexToAnsi(hex: string): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `\x1b[38;2;${(n >> 16) & 0xff};${(n >> 8) & 0xff};${n & 0xff}m`;
}

const BOLD = "\x1b[1m";
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

const lang = process.argv[2] || "typescript";
const theme = process.argv[3] || "nord";

console.log(`Initializing shiki (lang=${lang}, theme=${theme})...`);

const highlighter = await createHighlighter({ themes: [theme], langs: [lang] });

function highlight(line: string): string {
  const tokens = highlighter.codeToTokensBase(line, { lang, theme });
  if (!tokens[0]) return line;
  let result = "";
  for (const token of tokens[0]) {
    let prefix = "";
    if (token.color) prefix += hexToAnsi(token.color);
    if (token.fontStyle) {
      if (token.fontStyle & 1) prefix += ITALIC;
      if (token.fontStyle & 2) prefix += BOLD;
    }
    result += prefix + token.content + RESET;
  }
  return result;
}

console.log(`\nEnter ${lang} code (true-color highlighting with ${theme} theme):\n`);

const [_code, error] = await readMultiline("", {
  prefix: `${lang}> `,
  linePrefix: "   | ",
  highlight,
  preferNewlineOnEnter: true,
  helpFooter: true,
  theme: { submitRender: "content" },
});

highlighter.dispose();

if (error) {
  console.log(`\n(${error.kind})`);
}
