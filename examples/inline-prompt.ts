/**
 * Example: inlinePrompt option
 *
 * Renders the prompt header and the input on the same line.
 * Useful for short, single-line-style questions where you want
 * the prompt and the input to be visually connected.
 *
 * What to try:
 * - Just type → the cursor stays on the prompt line (no leading prefix).
 * - Shift+Enter (or Ctrl+J) → inserts a newline. The second line uses `linePrefix`.
 * - Arrow keys / Home / End / Backspace across the newline → cursor math should
 *   stay correct on row 0 even though the prompt header is inline.
 * - Ctrl+Z / Ctrl+Y → undo/redo must not duplicate the prompt header.
 * - Ctrl+L → clears and redraws; the inline header should reappear once.
 *
 * Run: npx tsx examples/inline-prompt.ts
 */
import { readMultiline } from "../src/index.js";

console.log("=== inlinePrompt: true ===");
console.log("Prompt and input share the same line. Shift+Enter inserts a newline.\n");

const [name, err1] = await readMultiline("Name: ", {
  prefix: "",
  linePrefix: "  ",
  inlinePrompt: true,
  helpFooter: true,
});
if (err1) {
  console.log(`(${err1.kind})`);
} else {
  console.log(`--- Result ---\n${JSON.stringify(name)}\n`);
}

console.log("=== inlinePrompt: true + preserve submit + validation ===");
console.log("Type at least 3 characters. Try Shift+Enter for a second line.\n");

const [bio, err2] = await readMultiline("Bio: ", {
  prefix: "",
  linePrefix: "  ",
  inlinePrompt: true,
  theme: { submitRender: "preserve" },
  validate: (v) => (v.trim().length < 3 ? "Please enter at least 3 characters" : null),
  helpFooter: true,
});
if (err2) {
  console.log(`(${err2.kind})`);
} else {
  console.log(`--- Result ---\n${JSON.stringify(bio)}\n`);
}

console.log("=== inlinePrompt: false (default) — same prompts for comparison ===\n");

const [name2, err3] = await readMultiline("Name:", {
  prefix: "> ",
  linePrefix: "  ",
  helpFooter: true,
});
if (err3) {
  console.log(`(${err3.kind})`);
} else {
  console.log(`--- Result ---\n${JSON.stringify(name2)}`);
}
