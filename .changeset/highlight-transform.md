---
"@toiroakr/read-multiline": patch
---

Add `highlight` and `transform` options to readMultiline

- `highlight`: per-line syntax highlighting callback returning ANSI-decorated strings. Takes precedence over `theme.input` styling. Preserved across all edit operations (insert, backspace, delete). Skipped during paste for performance.
- `transform`: post-edit state transformation callback (e.g., auto-close brackets, auto-indent). Receives `TransformState` and `TransformEvent`, returns modified state or `undefined`. Skipped during paste. Results validated with row/col clamping.
- Export `TransformState` and `TransformEvent` types for consumer use.
