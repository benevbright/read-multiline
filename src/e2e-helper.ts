import { readMultiline } from "./index.js";

const [text, error] = await readMultiline("prompt>", {});
if (error) {
  process.stdout.write("ERROR:" + error.kind + "\n");
} else {
  process.stdout.write("RESULT:" + JSON.stringify(text) + "\n");
}
// Wait for output to flush before exiting
await new Promise((r) => setTimeout(r, 500));
process.exit(0);
