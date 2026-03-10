---
"@toiroakr/read-multiline": patch
---

Change Ctrl+D behavior with existing input from submit to delete-char (matching readline/shell conventions). Add `onCancel` option to allow custom Ctrl+C handling instead of throwing CancelError.
