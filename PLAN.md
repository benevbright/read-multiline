# Syntax Highlighting & Auto Editing Implementation Plan

## Current State Analysis

`read-multiline` is a multi-line input library for Node.js terminals. The current rendering is **plain text only**, outputting lines directly via `w(state, line)`. Character width calculation (CJK support) exists, but ANSI escape sequence decoration is not supported.

### Current Rendering (Affected Areas)
- `rendering.ts`: `redrawFrom()`, `clearScreen()`, `restoreSnapshot()` — output lines as plain text
- `editing.ts`: `insertChar()` — redraws remaining text after cursor as plain text
- `chars.ts`: `stringWidth()` — does not account for ANSI escape sequences

---

## Phase 1: Syntax Highlighting Foundation

### 1-1. Highlight Callback Introduction

**Goal**: Allow users to provide a per-line highlight function.

```ts
// Add to types.ts
interface ReadMultilineOptions {
  /**
   * Receives line text and returns a string with ANSI escape sequences.
   * Line number (0-indexed) is also provided.
   */
  highlight?: (line: string, lineIndex: number) => string;
}
```

**Files changed**: `types.ts`, `index.ts` (state initialization)

### 1-2. ANSI-Aware Character Width Calculation

**Goal**: Correctly calculate display width of strings containing ANSI escape sequences.

- Add `stripAnsi(text: string): string` to `chars.ts`
- ANSI-aware width for highlighted text (existing `stringWidth` remains for plain text; provide a utility that strips ANSI before width calculation for highlighted text)

**Files changed**: `chars.ts`

### 1-3. Highlight-Aware Rendering

**Goal**: Apply the highlight function when rendering lines.

- Store `highlight` function in `EditorState`
- At render time, obtain decorated text via `state.highlight?.(line, rowIndex) ?? line`

**Design — Introducing `renderLine()`**:

Unify all line rendering through a single **`renderLine(state, rowIndex): string`** function. This function determines whether highlighting is enabled and returns the appropriate text.

```ts
function renderLine(state: EditorState, rowIndex: number): string {
  const line = state.lines[rowIndex];
  return state.highlight ? state.highlight(line, rowIndex) : line;
}
```

This ensures consistent highlight application across all rendering paths:

1. **`redrawFrom()`** — multi-line redraw (newline, line merge, auto-indent 3-line operations)
2. **`clearScreen()`** — full redraw
3. **`restoreSnapshot()`** — full redraw after undo/redo
4. **`insertChar()`** — switches to full-line redraw when highlighting is enabled

**Important**: When auto-indent triggers a 3-line operation on newline inside brackets (modify original line + insert indented line + insert closing bracket line), this goes through the `insertNewline()` → `redrawFrom()` path. As long as `renderLine()` is used within `redrawFrom()`, highlight support is automatically provided. Full-line redraw in `insertChar()` alone is **not sufficient** — highlight support in `redrawFrom()` is **essential**.

**Files changed**: `rendering.ts`, `editing.ts`

### 1-4. Accurate Cursor Position Management

Since highlighted text contains ANSI codes, cursor position calculation continues to be based on **plain text `state.lines[row]`**. The existing `tCol()` is plain-text-based, so no changes are needed. Only the rendered output uses highlighted text; cursor movement is still calculated using plain text width.

→ **No changes** (design confirmation item)

---

## Phase 2: Auto Editing

### 2-1. Auto-Close Brackets

**Goal**: When `(` is typed, `)` is automatically inserted and the cursor is placed between the brackets.

```ts
// Add to types.ts
interface ReadMultilineOptions {
  /**
   * Array of bracket pairs for auto-completion.
   * Default: none (auto-completion disabled)
   * Example: [["(", ")"], ["[", "]"], ["{", "}"], ["\"", "\""], ["'", "'"]]
   */
  autoPairs?: [string, string][];
}
```

**Implementation approach**:
- In `insertChar()` in `editing.ts`, when the input character matches an opening character in `autoPairs`, also insert the closing character
- When the cursor is immediately before a closing character and that closing character is typed, skip insertion and move cursor one position right (overtype)
- When backspace deletes an opening bracket and the corresponding closing bracket immediately follows, delete both

**Files changed**: `types.ts`, `editing.ts`, `index.ts`

### 2-2. Auto-Indent on Newline

**Goal**: Automatically inherit the previous line's indentation when inserting a newline.

```ts
// Add to types.ts
interface ReadMultilineOptions {
  /**
   * Indent function called on newline.
   * Receives the current line content and cursor position, returns the indent string to insert.
   * Default: none (auto-indent disabled)
   *
   * Example (inherit previous line's indent):
   * (line) => line.match(/^(\s*)/)?.[1] ?? ""
   *
   * Example (increase indent after {):
   * (line, col) => {
   *   const indent = line.match(/^(\s*)/)?.[1] ?? "";
   *   const beforeCursor = line.slice(0, col);
   *   return beforeCursor.trimEnd().endsWith("{") ? indent + "  " : indent;
   * }
   */
  indent?: (line: string, col: number) => string;
}
```

**Implementation approach**:
- In `insertNewline()` in `editing.ts`, insert the return value of `indent()` at the beginning of the new line after the newline
- **3-line operation on newline inside brackets**: When combined with `autoPairs`, if the cursor is between an opening and closing bracket (e.g., `func(|)`) and Enter is pressed:
  1. Split the original line (up to `func(`)
  2. Insert a new line with indentation (cursor goes here)
  3. Place the closing bracket on the next line with reduced indentation
  ```
  // Before: func(|)
  // After:
  func(
      |          ← cursor (indentation computed by indent())
  )              ← original indentation level
  ```
  - This operation is performed within `insertNewline()`, ultimately calling `redrawFrom(state, row, row + 1, indent.length)`
  - Since `redrawFrom()` uses `renderLine()` for highlighted rendering, compatibility with Phase 1's highlight implementation is automatically ensured

**Files changed**: `types.ts`, `editing.ts`, `index.ts`

---

## Phase 3: Integration and Optimization

### 3-1. Highlight + Auto Editing Integration Tests

- Verify auto-close/auto-indent works correctly when highlighting is enabled
- Verify undo/redo correctly handles pair insertion (pair insertion is a single undo unit)
- Disable auto-close during paste (leverage existing `isPasting` flag)

### 3-2. Performance Considerations

#### Highlight Function Call Cost

`highlight()` is a user-provided function and may be expensive (e.g., regex-based tokenizer).

**Optimization strategies**:

1. **Introduce caching**: Cache highlight results for lines whose content hasn't changed
   ```ts
   // Add to EditorState
   highlightCache: Map<string, string>;  // lineContent → highlightedContent
   ```
   - Check cache in `renderLine()`; skip calling `highlight()` on cache hit
   - Cache key is line text (assumes same content produces same highlight result)
   - Set a cache size limit (e.g., max 1000 entries, LRU)
   - **Note**: If `highlight(line, lineIndex)` performs line-number-dependent decoration, the cache key must include the line number. However, typical syntax highlighting is line-number-independent, so by default only line content is used as the key. Provide an option to disable caching when line-number-dependent behavior is needed.

2. **Minimize redraw scope**:
   - `insertChar()`: Even with highlighting enabled, redraw **only the current line** (single-line redraw, not `redrawFrom()`)
   - `redrawFrom()`: Redraw from the changed line onward (same as current behavior). Even for auto-indent 3-line operations, only from `fromRow` onward
   - **Skip unchanged lines**: Consider skipping redraw of lines in `redrawFrom()` whose content hasn't changed before and after the edit (trade-off with cursor movement cost)

3. **Flicker prevention**:
   - Buffer output with `beginBatch()`/`flushBatch()` (leverage existing infrastructure)
   - Consider `\x1b[?2026h` (synchronized output) before outputting highlighted text (depends on terminal support)

#### `insertChar()` Performance

The current incremental rendering (output only inserted character + remaining text) is fast. Switching to full-line redraw when highlighting is enabled increases cost, but:
- Highlight calculation + ANSI output for a single line is typically fast enough
- Cache ensures `highlight()` is only called on cache misses
- `beginBatch()`/`flushBatch()` prevents flicker

#### `redrawFrom()` Bulk Line Redraw

Changes near the end of the file require redrawing few lines, but changes near the beginning require redrawing all lines.
- With many lines (100+), the cumulative cost of the highlight function may become noticeable
- Cache mitigates this, but full cache misses (e.g., right after paste) can be a bottleneck
- Mitigation: In `redrawFrom()`, only recompute highlights for changed lines; retrieve others from cache

---

## Recommended Implementation Order

| Step | Content | Scope |
|------|---------|-------|
| **Step 1** | `highlight` option + rendering support | `types.ts`, `rendering.ts`, `editing.ts`, `index.ts`, `chars.ts` |
| **Step 2** | `autoPairs` option (auto-close brackets) | `types.ts`, `editing.ts`, `index.ts` |
| **Step 3** | `indent` option (auto-indent) | `types.ts`, `editing.ts`, `index.ts` |
| **Step 4** | Add tests | `editing.test.ts` etc. |

Each step can be released independently. Step 1 has the widest impact; Steps 2/3 are relatively localized changes.

---

## API Summary

```ts
readMultiline("> ", {
  // Syntax highlighting
  highlight: (line, index) => highlightJS(line),

  // Auto-close brackets
  autoPairs: [["(", ")"], ["[", "]"], ["{", "}"], ["\"", "\""]],

  // Auto-indent
  indent: (line, col) => {
    const base = line.match(/^(\s*)/)?.[1] ?? "";
    return line.slice(0, col).trimEnd().endsWith("{") ? base + "  " : base;
  },
});
```
