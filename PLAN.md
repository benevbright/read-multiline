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

1. **`redrawFrom()`** — multi-line redraw (newline, line merge, transform-triggered multi-line changes)
2. **`clearScreen()`** — full redraw
3. **`restoreSnapshot()`** — full redraw after undo/redo
4. **`insertChar()`** — switches to full-line redraw when highlighting is enabled

**Important**: Transform (Phase 2) may produce multi-line changes (e.g., bracket auto-indent: 3-line operation). These go through `redrawFrom()`. As long as `renderLine()` is used within `redrawFrom()`, highlight support is automatically provided. Full-line redraw in `insertChar()` alone is **not sufficient** — highlight support in `redrawFrom()` is **essential**.

**Files changed**: `rendering.ts`, `editing.ts`

### 1-4. Accurate Cursor Position Management

Since highlighted text contains ANSI codes, cursor position calculation continues to be based on **plain text `state.lines[row]`**. The existing `tCol()` is plain-text-based, so no changes are needed. Only the rendered output uses highlighted text; cursor movement is still calculated using plain text width.

→ **No changes** (design confirmation item)

---

## Phase 2: Transform — Unified Auto Editing

### 2-1. Design Philosophy

Instead of individual features (`autoPairs`, `indent`), provide a **single `transform` callback** that receives the full editor state after each edit and can replace the entire content with cursor repositioning. This gives users complete control to implement any auto-editing behavior.

### 2-2. API

```ts
// Add to types.ts
interface ReadMultilineOptions {
  /**
   * Called after each edit operation. Receives the current editor content,
   * cursor position, and what edit just occurred. Return a new state to
   * transform the content, or undefined to leave it unchanged.
   *
   * The returned lines/row/col completely replace the editor state.
   * Undo captures the state before the base edit + transform as one unit.
   */
  transform?: (
    state: { lines: string[]; row: number; col: number },
    event: TransformEvent,
  ) => { lines: string[]; row: number; col: number } | undefined;
}

type TransformEvent =
  | { type: "insert"; char: string }   // character inserted
  | { type: "newline" }                 // newline inserted
  | { type: "backspace" }              // backspace pressed
  | { type: "delete" };                // delete pressed
```

### 2-3. Usage Examples

```ts
readMultiline("> ", {
  transform(state, event) {
    const { lines, row, col } = state;
    const line = lines[row];

    // Auto-close brackets: ( → ()
    if (event.type === "insert") {
      const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
      const close = pairs[event.char];
      if (close) {
        const newLine = line.slice(0, col) + close + line.slice(col);
        return { lines: lines.with(row, newLine), row, col };
      }
      // Overtype closing bracket
      if (")]}".includes(event.char) && line[col] === event.char) {
        // Remove the duplicate and keep cursor where it is
        const newLine = line.slice(0, col - 1) + line.slice(col);
        return { lines: lines.with(row, newLine), row, col: col - 1 };
        // Actually: char was already inserted, so line[col] check is on post-insert state
      }
    }

    // Auto-indent + bracket newline: { + Enter → 3-line expansion
    if (event.type === "newline") {
      const prevLine = lines[row - 1];
      const indent = prevLine.match(/^(\s*)/)?.[1] ?? "";
      if (prevLine.trimEnd().endsWith("{") && line.trimStart().startsWith("}")) {
        // 3-line operation: {, indented cursor, }
        const newLines = [...lines];
        newLines[row] = indent + "  ";
        newLines.splice(row + 1, 0, indent + line.trimStart());
        return { lines: newLines, row, col: indent.length + 2 };
      }
      // Simple indent inheritance
      if (indent && !line.startsWith(indent)) {
        return { lines: lines.with(row, indent + line), row, col: indent.length + col };
      }
    }
  },
});
```

### 2-4. Implementation

**Call site**: After each edit operation in `editing.ts`, call `applyTransform()`:

```ts
function applyTransform(
  state: EditorState,
  event: TransformEvent,
): void {
  if (!state.transform) return;

  const oldLines = [...state.lines];
  const result = state.transform(
    { lines: [...state.lines], row: state.row, col: state.col },
    event,
  );
  if (!result) return;

  // Apply the new state
  state.lines.length = 0;
  state.lines.push(...result.lines);

  // Find first changed line to minimize redraw
  let fromRow = 0;
  while (fromRow < oldLines.length && fromRow < state.lines.length
    && oldLines[fromRow] === state.lines[fromRow]) {
    fromRow++;
  }

  // If lines or content changed, redraw from the first difference
  if (fromRow < state.lines.length || fromRow < oldLines.length) {
    redrawFrom(state, fromRow, result.row, result.col);
  } else if (result.row !== state.row || result.col !== state.col) {
    moveTo(state, result.row, result.col);
  }
}
```

**Edit points** — add `applyTransform()` call after each operation:
- `insertChar()` → `applyTransform(state, { type: "insert", char: ch })`
- `insertNewline()` → `applyTransform(state, { type: "newline" })`
- `handleBackspace()` → `applyTransform(state, { type: "backspace" })`
- `handleDelete()` → `applyTransform(state, { type: "delete" })`

**Undo integration**: `saveUndo()` is called _before_ the base edit. The transform is applied after the base edit. This means undo restores to the state before both the base edit and the transform — correct single-unit undo.

**Paste handling**: During paste (`state.isPasting`), skip transform calls. Auto-pairs and auto-indent should not trigger on pasted content. The `isPasting` flag already exists.

**Files changed**: `types.ts`, `editing.ts`, `index.ts`

### 2-5. Rendering Integration

Transform may produce changes ranging from single-character adjustments to multi-line operations. The rendering approach:

1. **Diff `oldLines` vs `state.lines`**: Find the first differing row
2. **`redrawFrom(fromRow, ...)`**: Redraw from that row onward — reuses existing infrastructure
3. **`renderLine()` in `redrawFrom()`** (from Phase 1): Highlighting is automatically applied

This means **no special rendering code is needed for transform**. The existing `redrawFrom()` + `renderLine()` handles all cases:
- Single-line change (auto-close bracket) → `fromRow` = current row, redraws 1 line + below
- Multi-line change (bracket auto-indent) → `fromRow` = modified row, redraws all affected lines

---

## Phase 3: Integration and Optimization

### 3-1. Integration Tests

- Verify transform works correctly when highlighting is enabled (both features compose)
- Verify undo/redo restores state before base edit + transform as one unit
- Verify transform is skipped during paste (`isPasting`)
- Verify transform returning `undefined` is a no-op (no unnecessary redraw)
- Verify multi-line transform (e.g., 3-line bracket expansion) renders correctly

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
   - `insertChar()` (no transform): Even with highlighting enabled, redraw **only the current line** (single-line redraw, not `redrawFrom()`)
   - `insertChar()` + transform single-line change: `redrawFrom()` from the current row — effectively 1 line
   - `redrawFrom()`: Redraw from the changed line onward (same as current behavior). Transform's diff-based `fromRow` ensures only affected lines are redrawn
   - **Skip unchanged lines**: Consider skipping redraw of lines in `redrawFrom()` whose content hasn't changed before and after the edit (trade-off with cursor movement cost)

3. **Flicker prevention**:
   - Buffer output with `beginBatch()`/`flushBatch()` (leverage existing infrastructure)
   - Consider `\x1b[?2026h` (synchronized output) before outputting highlighted text (depends on terminal support)

#### Transform Performance

- `applyTransform()` diffs old vs new lines to find the first changed row — O(n) string comparisons where n = number of lines
- For typical inputs (< 100 lines), this is negligible
- Transform receives a copy of `lines` array (`[...state.lines]`) to prevent accidental mutation — small allocation cost per edit, acceptable for interactive input
- If transform returns `undefined` (no change), no rendering occurs — zero cost path

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
| **Step 1** | `highlight` option + `renderLine()` + rendering support | `types.ts`, `rendering.ts`, `editing.ts`, `index.ts`, `chars.ts` |
| **Step 2** | `transform` option + `applyTransform()` + rendering integration | `types.ts`, `editing.ts`, `index.ts` |
| **Step 3** | Add tests | `editing.test.ts` etc. |

Step 1 has the widest impact (all rendering paths). Step 2 is localized to edit call sites + one new function. Each step can be released independently.

---

## API Summary

```ts
readMultiline("> ", {
  // Syntax highlighting
  highlight: (line, index) => highlightJS(line),

  // Auto editing (auto-pairs + auto-indent + any custom behavior)
  transform(state, event) {
    // User implements whatever auto-editing logic they need.
    // Return { lines, row, col } to replace state, or undefined for no-op.
  },
});
```
