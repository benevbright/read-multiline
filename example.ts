import { readMultiline } from "./src/index.js";

console.log("Multi-line input test\n");

const history: string[] = [];

while (true) {
  const [value, error] = await readMultiline("Enter your message:", {
    prefix: "> ",
    linePrefix: "  ",
    history,
    maxLines: 100,
    maxLength: 500,
    validate: (v) => (v.trim().length === 0 ? "Input cannot be empty" : undefined),
    helpFooter: true,
  });

  if (error) {
    if (error.kind === "cancel") {
      console.log("\n(Cancelled)\n");
      continue;
    } else if (error.kind === "eof") {
      console.log("\n(EOF: exiting)");
      break;
    } else {
      throw new Error(`Unexpected ReadMultilineError kind: ${String((error as any).kind)}`);
    }
  }

  console.log("--- Received input ---");
  console.log(value);
  console.log("--- End ---");
  console.log("");
  history.push(value);
}
