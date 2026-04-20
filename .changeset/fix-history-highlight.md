---
"@toiroakr/read-multiline": patch
---

Apply the `highlight` callback when navigating history. Previously, loading
a history entry (via Up/Down, Alt+Up/Down, Ctrl+P/N, or PageUp/PageDown) drew
the content with `styledInput` only, bypassing the user-supplied `highlight`
function. History content now renders through the same `renderLine` path as
other draws, so syntax highlighting is preserved after switching entries.
