# read-multiline

Simple multi-line input reader for Node.js terminals. Solves the limitation of Node.js's built-in `readline` module which only supports single-line input.

## Features

- **Enter** to submit, **Shift+Enter** / **Ctrl+J** to insert newlines (swappable)
- Arrow key cursor navigation across lines
- **Alt+Arrow** for word jumping, **Cmd+Arrow** for line/buffer jumping
- **Delete**, **Ctrl+U**, **Ctrl+K** for forward delete and line editing
- **Ctrl+W** to delete previous word
- **Ctrl+L** to clear screen and redraw
- Full-width (CJK) character support with correct cursor positioning
- Bracketed paste mode for multi-line paste
- Input history navigation (Up/Down at boundaries)
- Initial value pre-population
- Validation with debounced live feedback
- Max lines / max character length enforcement
- Terminal resize (SIGWINCH) handling
- **Ctrl+C** / **Ctrl+D** handling
- Non-TTY (pipe) input support
- Zero dependencies

Best experience with terminals supporting the [kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) (kitty, iTerm2, WezTerm, Ghostty, foot, etc.). Legacy terminals can use **Ctrl+J** as a universal newline/submit fallback.

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
    history: ["previous input"],
    maxLines: 10,
    maxLength: 1000,
    validate: (v) => (v.trim() === "" ? "Input cannot be empty" : undefined),
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
| `initialValue` | `string` | `undefined` | Pre-populate the input |
| `history` | `string[]` | `[]` | History entries (oldest first) |
| `maxLines` | `number` | `undefined` | Maximum number of lines |
| `maxLength` | `number` | `undefined` | Maximum total character count |
| `validate` | `(value: string) => string \| undefined \| null` | `undefined` | Validation function (return error message to reject) |
| `validateDebounceMs` | `number` | `300` | Debounce interval for live validation |
| `submitOnEnter` | `boolean` | `true` | `true`: Enter=submit, `false`: Enter=newline |
| `disabledKeys` | `ModifiedEnterKey[]` | `[]` | Key combos to disable |

### Key Bindings

**`submitOnEnter: true` (default):**

| Key | Action |
|---|---|
| Enter | Submit |
| Shift+Enter | Newline (kitty protocol) |
| Ctrl+Enter | Newline (kitty protocol) |
| Cmd+Enter | Newline (kitty protocol, macOS) |
| Alt+Enter | Newline |
| Ctrl+J | Newline (universal fallback) |

**`submitOnEnter: false`:**

| Key | Action |
|---|---|
| Enter | Newline |
| Shift+Enter | Submit (kitty protocol) |
| Ctrl+Enter | Submit (kitty protocol) |
| Cmd+Enter | Submit (kitty protocol, macOS) |
| Alt+Enter | Submit |
| Ctrl+J | Submit (universal fallback) |

**Other key bindings (always active):**

| Key | Action |
|---|---|
| Backspace | Delete character (merges lines at boundary) |
| Delete | Forward delete character (merges lines at boundary) |
| Ctrl+U | Delete to line start |
| Ctrl+K | Delete to line end |
| Ctrl+W | Delete previous word |
| Left/Right | Move cursor (crosses line boundaries) |
| Up/Down | Move between lines (history at boundaries) |
| Alt+Left/Right | Word jump |
| Cmd+Left/Right | Line start/end |
| Cmd+Up/Down | Buffer start/end |
| Home/End | Line start/end |
| Ctrl+L | Clear screen and redraw |
| Ctrl+C | Cancel (`CancelError`) |
| Ctrl+D | Submit if input exists, EOF if empty (`EOFError`) |

### Terminal Compatibility

| Key | Kitty protocol | Legacy terminal |
|---|---|---|
| Shift+Enter | Yes | No (same as Enter) |
| Ctrl+Enter | Yes | No (same as Ctrl+J) |
| Cmd+Enter | Yes (macOS) | No |
| Alt+Enter | Yes | Mostly yes |
| **Ctrl+J** | Yes | **Yes (universal)** |

### Disabling Keys

Use `disabledKeys` to ignore specific key combinations:

```typescript
// Disable Ctrl+J (e.g., if it conflicts with your app)
await readMultiline({ disabledKeys: ["ctrl+j"] });

// Only allow Shift+Enter and Ctrl+J as newline
await readMultiline({ disabledKeys: ["ctrl+enter", "cmd+enter", "alt+enter"] });
```

Valid values: `"shift+enter"`, `"ctrl+enter"`, `"cmd+enter"`, `"alt+enter"`, `"ctrl+j"`

### Validation

When a `validate` function is provided:
1. On submit, the input is validated. If validation fails, a red error message appears below the input and submission is blocked.
2. After the first validation failure, validation runs on every change (debounced) with live feedback: red for errors, green "OK" when valid.

### Limits

When `maxLines` or `maxLength` is set, input beyond the limit is silently blocked and a red error message appears below the input.

## License

MIT
