import {
  charAtIndex,
  charBeforeIndex,
  charWidth,
  contentLength,
  isWordChar,
  stringWidth,
} from "./chars.js";
import {
  clearStatus,
  pW,
  redrawAfterDelete,
  redrawFrom,
  restoreSnapshot,
  setStatus,
  w,
} from "./rendering.js";
import type { EditorState, Snapshot } from "./types.js";

const MAX_UNDO = 200;

// --- Undo / Redo ---

export function takeSnapshot(state: EditorState): Snapshot {
  return { lines: [...state.lines], row: state.row, col: state.col };
}

export function saveUndo(state: EditorState, editType: "insert" | "other" = "other"): void {
  if (editType === "insert" && state.lastEditType === "insert" && state.undoStack.length > 0) {
    state.lastEditType = editType;
    return;
  }
  state.lastEditType = editType;
  state.undoStack.push(takeSnapshot(state));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack.length = 0;
}

export function undo(state: EditorState): void {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(takeSnapshot(state));
  const snap = state.undoStack.pop()!;
  restoreSnapshot(state, snap);
  state.lastEditType = "";
  onContentChanged(state);
}

export function redo(state: EditorState): void {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(takeSnapshot(state));
  const snap = state.redoStack.pop()!;
  restoreSnapshot(state, snap);
  state.lastEditType = "";
  onContentChanged(state);
}

// --- Validation / Content change ---

function scheduleValidation(state: EditorState): void {
  if (!state.validationActive || !state.validate) return;
  if (state.validateTimer) clearTimeout(state.validateTimer);
  state.validateTimer = setTimeout(() => {
    state.validateTimer = null;
    const error = state.validate!(state.lines.join("\n"));
    if (error) {
      setStatus(state, error, "red");
    } else {
      setStatus(state, "OK", "green");
    }
  }, state.validateDebounceMs);
}

export function onContentChanged(state: EditorState): void {
  if (state.maxLength != null) {
    const len = contentLength(state.lines);
    if (len >= state.maxLength) {
      setStatus(state, `Maximum ${state.maxLength} characters`, "red");
      return;
    }
  }

  if (state.validationActive) {
    scheduleValidation(state);
  } else {
    clearStatus(state);
  }
}

// --- Limit checks ---

function canInsertChar(state: EditorState, charCount: number = 1): boolean {
  if (state.maxLength != null) {
    const len = contentLength(state.lines);
    if (len + charCount > state.maxLength) {
      setStatus(state, `Maximum ${state.maxLength} characters`, "red");
      return false;
    }
  }
  return true;
}

function canInsertNewline(state: EditorState): boolean {
  if (state.maxLines != null && state.lines.length >= state.maxLines) {
    setStatus(state, `Maximum ${state.maxLines} lines`, "red");
    return false;
  }
  if (state.maxLength != null) {
    const len = contentLength(state.lines);
    if (len + 1 > state.maxLength) {
      setStatus(state, `Maximum ${state.maxLength} characters`, "red");
      return false;
    }
  }
  return true;
}

// --- Editing operations ---

export function insertChar(state: EditorState, ch: string): void {
  if (!canInsertChar(state, [...ch].length)) return;
  if (!state.isPasting) saveUndo(state, "insert");
  state.lines[state.row] =
    state.lines[state.row].slice(0, state.col) + ch + state.lines[state.row].slice(state.col);
  state.col += ch.length;
  const rest = state.lines[state.row].slice(state.col);
  w(state, ch + rest);
  const restW = stringWidth(rest);
  if (restW > 0) w(state, `\x1b[${restW}D`);
  onContentChanged(state);
}

export function insertNewline(state: EditorState): void {
  if (!canInsertNewline(state)) return;
  if (!state.isPasting) saveUndo(state);
  const after = state.lines[state.row].slice(state.col);
  state.lines[state.row] = state.lines[state.row].slice(0, state.col);
  state.lines.splice(state.row + 1, 0, after);
  redrawFrom(state, state.row, state.row + 1, 0);
  onContentChanged(state);
}

export function handleBackspace(state: EditorState): void {
  if (state.col > 0) {
    saveUndo(state);
    const deleted = charBeforeIndex(state.lines[state.row], state.col);
    state.col -= deleted.length;
    state.lines[state.row] =
      state.lines[state.row].slice(0, state.col) +
      state.lines[state.row].slice(state.col + deleted.length);
    redrawAfterDelete(state, charWidth(deleted.codePointAt(0)!));
    onContentChanged(state);
  } else if (state.row > 0) {
    saveUndo(state);
    const prevLen = state.lines[state.row - 1].length;
    state.lines[state.row - 1] += state.lines[state.row];
    state.lines.splice(state.row, 1);
    redrawFrom(state, state.row - 1, state.row - 1, prevLen);
    onContentChanged(state);
  }
}

export function handleDelete(state: EditorState): void {
  if (state.col < state.lines[state.row].length) {
    saveUndo(state);
    const deleted = charAtIndex(state.lines[state.row], state.col);
    state.lines[state.row] =
      state.lines[state.row].slice(0, state.col) +
      state.lines[state.row].slice(state.col + deleted.length);
    const rest = state.lines[state.row].slice(state.col);
    const restW = stringWidth(rest);
    const deletedW = charWidth(deleted.codePointAt(0)!);
    w(state, `${rest}${" ".repeat(deletedW)}`);
    if (restW + deletedW > 0) w(state, `\x1b[${restW + deletedW}D`);
    onContentChanged(state);
  } else if (state.row < state.lines.length - 1) {
    saveUndo(state);
    state.lines[state.row] += state.lines[state.row + 1];
    state.lines.splice(state.row + 1, 1);
    redrawFrom(state, state.row, state.row, state.col);
    onContentChanged(state);
  }
}

export function deleteToLineStart(state: EditorState): void {
  if (state.col === 0) return;
  saveUndo(state);
  const deletedWidth = stringWidth(state.lines[state.row].slice(0, state.col));
  state.lines[state.row] = state.lines[state.row].slice(state.col);
  state.col = 0;
  w(state, `\x1b[${pW(state, state.row) + 1}G`);
  w(state, state.lines[state.row]);
  w(state, " ".repeat(deletedWidth));
  w(state, `\x1b[${pW(state, state.row) + 1}G`);
  onContentChanged(state);
}

export function deleteToLineEnd(state: EditorState): void {
  if (state.col >= state.lines[state.row].length) return;
  saveUndo(state);
  state.lines[state.row] = state.lines[state.row].slice(0, state.col);
  w(state, "\x1b[K");
  onContentChanged(state);
}

export function deleteWordBack(state: EditorState): void {
  if (state.col === 0) {
    handleBackspace(state);
    return;
  }
  saveUndo(state);
  const line = state.lines[state.row];
  let c = state.col;
  while (c > 0 && !isWordChar(charBeforeIndex(line, c))) {
    c -= charBeforeIndex(line, c).length;
  }
  while (c > 0 && isWordChar(charBeforeIndex(line, c))) {
    c -= charBeforeIndex(line, c).length;
  }
  const deletedWidth = stringWidth(line.slice(c, state.col));
  state.lines[state.row] = line.slice(0, c) + line.slice(state.col);
  state.col = c;
  redrawAfterDelete(state, deletedWidth);
  onContentChanged(state);
}
