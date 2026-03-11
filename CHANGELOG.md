# @toiroakr/read-multiline

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
