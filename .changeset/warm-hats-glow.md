---
"@toiroakr/read-multiline": minor
---

Add history customization with file persistence and dedicated navigation keys

- Add `HistoryOptions` for file-based persistent history (`filePath`, `maxEntries`)
- Add dedicated history keys: Alt+Up/Down, Ctrl+P/N, PageUp/PageDown
- Add `historyArrowNavigation` option to control Up/Down boundary behavior (single/double/disabled)
- Remap Ctrl+Arrow to line/buffer navigation for consistent modifier key hierarchy
- Support `~` home directory expansion in history `filePath`
- Fix footer disappearing during history navigation
