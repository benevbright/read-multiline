---
"@toiroakr/read-multiline": minor
---

Add theme/style system, prefix/prompt split, and presets

- Split `prompt` into `prefix` + `prompt`, separating the prompt header line from input lines
- Rename `linePrompt` to `linePrefix` (unified across all input lines)
- Add `PromptTheme` for styling (prefix, prompt, input, answer, error, success, footer)
- Add `Stateful<T>` type for pending/submitted/cancelled/error state-dependent values
- Add error visual state: dynamically switch prefix/linePrefix on validation failure
- Add `submitRender: 'preserve'` to re-render with submitted-state styles
- Add `cancelRender: 'preserve'` to re-render with cancelled-state styles
- Change `ReadMultilineResult` cancel/EOF to return `[string, ReadMultilineError]` instead of `[null, ReadMultilineError]`
- Remove `onError` option (cancel/EOF now always includes partial input in the result tuple)
- Add `createPrompt()` factory for reusable shared configuration
- Add `presets.inquirer` / `presets.clack` presets
- Add `actionStyle` and `separator` to help footer for inline layout support
- Add inquirer-style inline help footer (bold keys, dim actions, `•` separator)
