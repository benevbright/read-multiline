/**
 * Example: inlinePrompt option
 *
 * Reproduces the behavior documented in the PR description:
 *
 *   Before typing:   > Enter your name:
 *   While editing:   > Enter your name: Tom
 *   After submit:    ✔ Enter your name: Tom      (prefix transitions on submit)
 *   Subsequent lines still use the configured `linePrefix`.
 *
 * What to try:
 * - Just type → cursor stays on the prompt line (no leading prefix on row 0).
 * - Shift+Enter (or Ctrl+J) → inserts a newline. Row 1+ uses `linePrefix`.
 * - Arrow keys / Home / End / Backspace across the newline → cursor math on row 0.
 * - Ctrl+Z / Ctrl+Y → undo/redo must not duplicate the prompt header.
 * - Ctrl+L → clears and redraws; the inline header should reappear once.
 *
 * Run: npx tsx examples/inline-prompt.ts
 */
import { readMultiline } from "../src/index.js";

function printResult(label: string, value: string): void {
  console.log(`\n[${label}] result:`);
  for (const line of value.split("\n")) console.log(`  | ${line}`);
  console.log();
}

// --- 1. Behavior from the PR: prefix transitions on submit -------------------
// Before submit the prefix is "> " in blue; after submit it becomes "✔ " in green.
// submitRender: "preserve" keeps the submitted line visible in the scrollback.

console.log("=== 1. inlinePrompt with a stateful prefix (matches PR Behavior) ===");
console.log("Type a name and press Enter. Watch the prefix change to ✔ on submit.\n");

const [name, err1] = await readMultiline("Enter your name:", {
  prefix: { pending: "> ", submitted: "✔ ", cancelled: "✖ " },
  linePrefix: "  ",
  inlinePrompt: true,
  theme: {
    prefix: { pending: "blue", submitted: "green", cancelled: "red" },
    prompt: "bold",
    answer: "cyan",
    submitRender: "preserve",
    cancelRender: "preserve",
  },
  helpFooter: true,
});
if (err1) console.log(`(cancelled: ${err1.kind})`);
else printResult("name", name);

// --- 2. Multi-line inline input ---------------------------------------------
// Subsequent lines are prefixed by `linePrefix`, even though row 0 is inline
// with the prompt. Use Shift+Enter / Ctrl+J to insert newlines.

console.log("=== 2. Multi-line inline input (Shift+Enter / Ctrl+J for newline) ===");
console.log("Type a bio across multiple lines. At least 3 characters required.\n");

const [bio, err2] = await readMultiline("Bio:", {
  prefix: { pending: "> ", submitted: "✔ " },
  linePrefix: "  ",
  inlinePrompt: true,
  theme: {
    prefix: { pending: "blue", submitted: "green" },
    prompt: "bold",
    answer: "cyan",
    submitRender: "preserve",
  },
  validate: (v) => (v.trim().length < 3 ? "Please enter at least 3 characters" : null),
  helpFooter: true,
});
if (err2) console.log(`(cancelled: ${err2.kind})`);
else printResult("bio", bio);

// --- 3. Default (non-inline) rendering for comparison ------------------------

console.log("=== 3. inlinePrompt: false (default) — same prompt for comparison ===\n");

const [name2, err3] = await readMultiline("Enter your name:", {
  prefix: { pending: "> ", submitted: "✔ " },
  linePrefix: "  ",
  theme: {
    prefix: { pending: "blue", submitted: "green" },
    prompt: "bold",
    answer: "cyan",
    submitRender: "preserve",
  },
  helpFooter: true,
});
if (err3) console.log(`(cancelled: ${err3.kind})`);
else printResult("name2", name2);
