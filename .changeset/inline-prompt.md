---
"@toiroakr/read-multiline": patch
---

Add `inlinePrompt` option to render the prompt header and the first input line on the same terminal line

- New `inlinePrompt: boolean` option on `readMultiline`. When enabled, the prompt header (prefix + prompt) and the first input line share a single terminal line; subsequent lines still use the configured `linePrefix`.
- Combine with a `Stateful` `prefix` and `theme.submitRender: "preserve"` to transition the prefix on submit (e.g. `"> "` → `"✔ "`).
- Throws at call time if `inlinePrompt` is combined with a multi-line prompt header (`prefix` or `prompt` containing a newline); the option assumes a single-line header.
- See `examples/inline-prompt.ts` for a runnable demo.
