/**
 * Example: preferNewlineOnEnter option
 *
 * Demonstrates the behavior difference and kitty fallback.
 *
 * Run: npx tsx examples/prefer-newline.ts
 */
import { readMultiline } from "../src/index.js";

console.log("=== preferNewlineOnEnter: true ===");
console.log("Enter=newline, modified Enter=submit");
console.log("(Without kitty protocol, falls back to Enter=submit)\n");

const [text1, error1] = await readMultiline("Enter text:", {
  prefix: "> ",
  linePrefix: "  ",
  preferNewlineOnEnter: true,
  helpFooter: true,
});
if (error1) {
  console.log(`\n(${error1.kind})`);
} else {
  console.log("\n--- Result ---");
  console.log(text1);
}

console.log("\n=== preferNewlineOnEnter: false (default) ===");
console.log("Enter=submit, Ctrl+J/Shift+Enter=newline\n");

const [text2, error2] = await readMultiline("Enter text:", {
  prefix: "> ",
  linePrefix: "  ",
  helpFooter: true,
});
if (error2) {
  console.log(`\n(${error2.kind})`);
} else {
  console.log("\n--- Result ---");
  console.log(text2);
}
