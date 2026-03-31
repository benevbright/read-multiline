# @toiroakr/read-multiline

## 0.3.0

### Minor Changes

- 1416098: Extend submitRender/cancelRender with "ellipsis" and number modes to control how many input lines are displayed after submission or cancellation

### Patch Changes

- 22a4b48: Add explicit node types to tsconfig.json for TypeScript 6 compatibility
- d25b761: Add `highlight` and `transform` options to readMultiline

  - `highlight`: per-line syntax highlighting callback returning ANSI-decorated strings. Takes precedence over `theme.input` styling. Preserved across all edit operations (insert, backspace, delete). Skipped during paste for performance.
  - `transform`: post-edit state transformation callback (e.g., auto-close brackets, auto-indent). Receives `TransformState` and `TransformEvent`, returns modified state or `undefined`. Skipped during paste. Results validated with row/col clamping.
  - Export `TransformState` and `TransformEvent` types for consumer use.

## 0.2.1

### Patch Changes

- 8a6ad41: Fix Ctrl+J not inserting newline in terminals with kitty keyboard protocol support
- 73f3319: Use Node 24 in release workflow for npm trusted publishing support (requires npm >= 11.5.1)

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
