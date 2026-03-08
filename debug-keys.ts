/**
 * Debug tool for displaying escape sequences of key inputs.
 * Usage: npx tsx debug-keys.ts
 * Press Ctrl+C to exit.
 */

process.stdin.setRawMode(true);
process.stdin.resume();

// Enable kitty keyboard protocol
process.stdout.write("\x1b[>1u");

console.log("Key input debug mode (Ctrl+C to exit)");
console.log("Escape sequences of pressed keys will be displayed\n");

process.stdin.on("data", (data: Buffer) => {
  const hex = [...data].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const repr = data
    .toString()
    .replace(/\x1b/g, "ESC")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");

  console.log(`  hex: ${hex}  repr: ${repr}  raw: ${JSON.stringify(data.toString())}`);

  // Ctrl+C (legacy or kitty)
  if (data.toString() === "\x03" || data.toString() === "\x1b[99;5u") {
    process.stdout.write("\x1b[<u"); // Disable kitty protocol
    process.stdin.setRawMode(false);
    process.exit(0);
  }
});
