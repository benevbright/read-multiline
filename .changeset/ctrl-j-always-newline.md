---
"@toiroakr/read-multiline": minor
---

BREAKING: Ctrl+J always newline, API signature refactor, kitty fallback

- Ctrl+J (0x0A) always inserts a newline regardless of settings
- Rename `submitOnEnter` to `preferNewlineOnEnter` (inverted semantics, default: `false`)
- Change `readMultiline(prompt, options?)` signature: prompt is now a required first argument
- Remove deprecated `clearAfterSubmit` option (use `theme.submitRender` instead)
- `preferNewlineOnEnter` falls back to `false` when kitty protocol is not supported
- Footer correctly separates Ctrl+J (always newline) from other modified keys in help display
