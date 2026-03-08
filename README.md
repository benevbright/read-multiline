# read-multiline

Simple multi-line input reader for Node.js terminals. Solves the limitation of Node.js's built-in `readline` module which only supports single-line input.

## Features

- **Enter** to submit, **Shift+Enter** to insert newlines
- Arrow key cursor navigation across lines
- **Alt+Arrow** for word jumping, **Cmd+Arrow** for line/buffer jumping
- **Ctrl+W** to delete previous word
- Full-width (CJK) character support with correct cursor positioning
- Bracketed paste mode for multi-line paste
- **Ctrl+C** / **Ctrl+D** handling
- Non-TTY (pipe) input support
- Zero dependencies

Requires a terminal that supports the [kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) (kitty, iTerm2, WezTerm, Ghostty, foot, etc.).

## Install

```bash
npm install read-multiline
```

## Usage

```typescript
import { readMultiline, CancelError, EOFError } from "read-multiline";

try {
  const input = await readMultiline({
    prompt: "> ",
    linePrompt: "  ",
  });
  console.log("You entered:", input);
} catch (e) {
  if (e instanceof CancelError) {
    console.log("Cancelled");
  } else if (e instanceof EOFError) {
    console.log("EOF");
  }
}
```

## API

### `readMultiline(options?): Promise<string>`

| Option | Type | Default | Description |
|---|---|---|---|
| `prompt` | `string` | `""` | Prompt for the first line |
| `linePrompt` | `string` | same as `prompt` | Prompt for continuation lines |
| `input` | `TTYInput` | `process.stdin` | Input stream |
| `output` | `WritableStream` | `process.stdout` | Output stream |

### Key Bindings

| Key | Action |
|---|---|
| Enter | Submit input |
| Shift+Enter | Insert newline |
| Backspace | Delete character (merges lines at boundary) |
| Ctrl+W | Delete previous word |
| Left/Right | Move cursor (crosses line boundaries) |
| Up/Down | Move between lines |
| Alt+Left/Right | Word jump |
| Cmd+Left/Right | Line start/end |
| Cmd+Up/Down | Buffer start/end |
| Home/End | Line start/end |
| Ctrl+C | Cancel (`CancelError`) |
| Ctrl+D | Submit if input exists, EOF if empty (`EOFError`) |

## License

MIT
