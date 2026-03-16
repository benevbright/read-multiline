/**
 * Example: preferNewlineOnEnter option
 *
 * Demonstrates the behavior difference and kitty/Terminal.app fallback.
 *
 * Run: npx tsx examples/prefer-newline.ts
 */
import { readMultiline } from "../src/index.js";

console.log("=== preferNewlineOnEnter: true ===");
console.log("Enter=newline, modified Enter=submit");
console.log("(On Terminal.app without Meta key setting, falls back to Enter=submit)\n");

try {
  const [text] = await readMultiline("Enter text:", {
    prefix: "> ",
    linePrefix: "  ",
    preferNewlineOnEnter: true,
    helpFooter: true,
  });
  console.log("\n--- Result ---");
  console.log(text);
} catch {
  console.log("\n(cancelled)");
}

console.log("\n=== preferNewlineOnEnter: false (default) ===");
console.log("Enter=submit, Ctrl+J/Shift+Enter=newline\n");

try {
  const [text] = await readMultiline("Enter text:", {
    prefix: "> ",
    linePrefix: "  ",
    helpFooter: true,
  });
  console.log("\n--- Result ---");
  console.log(text);
} catch {
  console.log("\n(cancelled)");
}
