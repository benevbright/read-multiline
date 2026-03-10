# @toiroakr/read-multiline

## 0.1.2

### Patch Changes

- 18050be: Require cursor at line boundary before history navigation. Up at first line moves cursor to start first; Down at last line moves cursor to end first.
- c6e4ec7: Migrate package manager from npm to pnpm

## 0.1.1

### Patch Changes

- c2a19f8: Add pkg-pr-new preview workflow for publishing preview packages on pull requests
- ba43b6a: Change Ctrl+D behavior with existing input from submit to delete-char (matching readline/shell conventions). Add `onCancel` option to allow custom Ctrl+C handling instead of throwing CancelError.
