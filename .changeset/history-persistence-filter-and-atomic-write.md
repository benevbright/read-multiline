---
"@toiroakr/read-multiline": minor
---

Harden persistent history: add `shouldPersist` predicate and make file writes atomic

- Add `HistoryOptions.shouldPersist?: (value: string) => boolean` so callers can opt submitted values out of the on-disk history (e.g. REPL meta commands, empty inputs) without losing the ability to accept them in `validate`.
- Rewrite the persistence path as a read-modify-write using a sibling temp file plus `fs.rename`. Concurrent sessions that appended entries after this session started are now merged in instead of being clobbered, and readers never observe a partially written JSON document.
