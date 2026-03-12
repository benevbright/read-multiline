import { CancelError, EOFError, readMultiline } from "./src/index.js";

console.log("Multi-line input test\n");

const history: string[] = [];

while (true) {
  try {
    const result = await readMultiline({
      prompt: "> ",
      linePrompt: "  ",
      history,
      maxLines: 100,
      maxLength: 500,
      validate: (v) => (v.trim().length === 0 ? "Input cannot be empty" : undefined),
      helpFooter: true,
    });

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
