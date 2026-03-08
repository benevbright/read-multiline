import { readMultiline, CancelError, EOFError } from "./src/index.js";

console.log("Multi-line input test");
console.log("  Enter:         Submit input");
console.log("  Shift+Enter:   Insert newline");
console.log("  Left/Right:    Cursor movement");
console.log("  Up/Down:       Move between lines");
console.log("  Alt+Left/Right: Word jump");
console.log("  Cmd+Left/Right: Line start/end");
console.log("  Cmd+Up/Down:   Buffer start/end");
console.log("  Ctrl+C:        Cancel");
console.log("  Ctrl+D:        Submit / EOF if empty");
console.log("");

try {
  const result = await readMultiline({
    prompt: "> ",
    linePrompt: "  ",
  });

  console.log("");
  console.log("--- Received input ---");
  console.log(result);
  console.log("--- End ---");
} catch (e) {
  if (e instanceof CancelError) {
    console.log("\n(Cancelled)");
  } else if (e instanceof EOFError) {
    console.log("\n(EOF: no input)");
  } else {
    throw e;
  }
}
