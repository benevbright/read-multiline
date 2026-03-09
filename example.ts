import { readMultiline, CancelError, EOFError } from "./src/index.js";

console.log("Multi-line input test");
console.log("  Enter:              Submit input");
console.log("  Shift/Ctrl/Cmd+Enter, Ctrl+J: Insert newline");
console.log("  Left/Right:         Cursor movement");
console.log("  Up/Down:            Move between lines / history");
console.log("  Alt+Left/Right:     Word jump");
console.log("  Cmd+Left/Right:     Line start/end");
console.log("  Cmd+Up/Down:        Buffer start/end");
console.log("  Delete:             Forward delete");
console.log("  Ctrl+U:             Delete to line start");
console.log("  Ctrl+K:             Delete to line end");
console.log("  Ctrl+L:             Clear screen");
console.log("  Ctrl+C:             Cancel");
console.log("  Ctrl+D:             Submit / EOF if empty");
console.log("");

const history: string[] = [];

while (true) {
  try {
    const result = await readMultiline({
      prompt: "> ",
      linePrompt: "  ",
      history,
      maxLines: 10,
      maxLength: 500,
      validate: (v) => (v.trim().length === 0 ? "Input cannot be empty" : undefined),
    });

    console.log("");
    console.log("--- Received input ---");
    console.log(result);
    console.log("--- End ---");
    console.log("");
    history.push(result);
  } catch (e) {
    if (e instanceof CancelError) {
      console.log("\n(Cancelled)\n");
      continue;
    } else if (e instanceof EOFError) {
      console.log("\n(EOF: exiting)");
      break;
    } else {
      throw e;
    }
  }
}
