# @toiroakr/read-multiline

## 0.5.0

### Minor Changes

- 02d8f95: BREAKING: Ctrl+J always newline, API signature refactor, kitty fallback

  - Ctrl+J (0x0A) always inserts a newline regardless of settings
  - Rename `submitOnEnter` to `preferNewlineOnEnter` (inverted semantics, default: `false`)
  - Change `readMultiline(prompt, options?)` signature: prompt is now a required first argument
  - Remove deprecated `clearAfterSubmit` option (use `theme.submitRender` instead)
  - `preferNewlineOnEnter` falls back to `false` when kitty protocol is not supported
  - Footer correctly separates Ctrl+J (always newline) from other modified keys in help display

- 0dc8d05: Add theme/style system, prefix/prompt split, and presets

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

- b979fef: Return `[value, error]` tuple instead of throwing errors. Remove `onCancel` option. Replace `CancelError`/`EOFError` classes with plain `{ kind, message }` objects.

### Patch Changes

- ab98616: Preserve visual column position when moving cursor up/down between lines with mixed full-width and half-width characters
- 651f294: Fix example.ts to use result tuple pattern instead of try/catch with non-existent CancelError/EOFError classes
- 8d45f77: Strip ANSI escape codes in stringWidth using node:util stripVTControlCharacters for correct width calculation of styled strings

## 0.4.0

### Minor Changes

- 3ef5928: Add `clearAfterSubmit` option (default: `true`) that clears the editor input from the terminal after submission. Set to `false` to preserve the previous behavior where input remains visible.

## 0.3.0

### Minor Changes

- d292eee: Add history customization with file persistence and dedicated navigation keys
  - Add `HistoryOptions` for file-based persistent history (`filePath`, `maxEntries`)
  - Add dedicated history keys: Alt+Up/Down, Ctrl+P/N, PageUp/PageDown
  - Add `historyArrowNavigation` option to control Up/Down boundary behavior (single/double/disabled)
  - Remap Ctrl+Arrow to line/buffer navigation for consistent modifier key hierarchy
  - Support `~` home directory expansion in history `filePath`
  - Fix footer disappearing during history navigation

## 0.2.0

### Minor Changes

- 110bfbe: Add `footer` option to display fixed text below the editor (e.g. help text). The footer appears below the status/error line and persists throughout the editing session.
- 317c248: Split single-file implementation into focused modules for improved maintainability. Fix onCancel to resolve the promise with current input content instead of leaving it pending. Reduce terminal flicker during screen redraw with output buffering and in-place rendering.

## 0.1.2

### Patch Changes

- 18050be: Require cursor at line boundary before history navigation. Up at first line moves cursor to start first; Down at last line moves cursor to end first.
- c6e4ec7: Migrate package manager from npm to pnpm

## 0.1.1

### Patch Changes

- c2a19f8: Add pkg-pr-new preview workflow for publishing preview packages on pull requests
- ba43b6a: Change Ctrl+D behavior with existing input from submit to delete-char (matching readline/shell conventions). Add `onCancel` option to allow custom Ctrl+C handling instead of throwing CancelError.
