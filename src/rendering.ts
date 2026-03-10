import { stringWidth } from "./chars.js";
import type { EditorState, Snapshot } from "./types.js";

/** Write text to the output stream (or buffer if batching) */
export function w(state: EditorState, text: string): void {
  if (state.buffering) {
    state.writeBuffer += text;
  } else {
    state.output.write(text);
  }
}

/** Begin buffering output writes for flicker-free batch rendering */
export function beginBatch(state: EditorState): void {
  state.buffering = true;
  state.writeBuffer = "";
}

/** Flush buffered output with cursor hidden during the write */
export function flushBatch(state: EditorState): void {
  state.buffering = false;
  if (state.writeBuffer) {
    state.output.write("\x1b[?25l" + state.writeBuffer + "\x1b[?25h");
    state.writeBuffer = "";
  }
}

/** Get the prompt display width for the given row */
export function pW(state: EditorState, r: number): number {
  return r === 0 ? state.promptWidth : state.linePromptWidth;
}

/** Get 1-based terminal column from line start to code unit index, accounting for display width */
export function tCol(state: EditorState, r: number, c: number): number {
  return pW(state, r) + stringWidth(state.lines[r].slice(0, c)) + 1;
}

/** Move terminal cursor from current position to (newRow, newCol) */
export function moveTo(state: EditorState, newRow: number, newCol: number): void {
  const dr = newRow - state.row;
  if (dr < 0) w(state, `\x1b[${-dr}A`);
  else if (dr > 0) w(state, `\x1b[${dr}B`);
  w(state, `\x1b[${tCol(state, newRow, newCol)}G`);
  state.row = newRow;
  state.col = newCol;
}

/** Draw the status line below the editor content */
export function drawStatus(state: EditorState): void {
  if (!state.statusText) return;
  const endRow = state.lines.length - 1;
  const dr = endRow - state.row;
  if (dr > 0) w(state, `\x1b[${dr}B`);
  else if (dr < 0) w(state, `\x1b[${-dr}A`);
  w(state, "\r\n");
  if (state.statusColor === "red") w(state, "\x1b[31m");
  else if (state.statusColor === "green") w(state, "\x1b[32m");
  w(state, state.statusText);
  if (state.statusColor) w(state, "\x1b[0m");
  w(state, "\x1b[K");
  const linesDown = endRow + 1;
  const upCount = linesDown - state.row;
  if (upCount > 0) w(state, `\x1b[${upCount}A`);
  w(state, `\x1b[${tCol(state, state.row, state.col)}G`);
}

/** Clear the status line and reset status state */
export function clearStatus(state: EditorState): void {
  if (!state.statusText) return;
  const endRow = state.lines.length - 1;
  const dr = endRow - state.row;
  if (dr > 0) w(state, `\x1b[${dr}B`);
  else if (dr < 0) w(state, `\x1b[${-dr}A`);
  w(state, "\r\n\x1b[K");
  const upCount = endRow + 1 - state.row;
  if (upCount > 0) w(state, `\x1b[${upCount}A`);
  w(state, `\x1b[${tCol(state, state.row, state.col)}G`);
  state.statusText = "";
  state.statusColor = "";
}

/** Display or update the status line with the given text and color */
export function setStatus(state: EditorState, text: string, color: "red" | "green" | ""): void {
  clearStatus(state);
  state.statusText = text;
  state.statusColor = color;
  if (text) drawStatus(state);
}

/** Redraw all lines from fromRow onwards, placing cursor at (targetRow, targetCol) */
export function redrawFrom(
  state: EditorState,
  fromRow: number,
  targetRow: number,
  targetCol: number,
): void {
  beginBatch(state);
  const dr = state.row - fromRow;
  if (dr > 0) w(state, `\x1b[${dr}A`);
  else if (dr < 0) w(state, `\x1b[${-dr}B`);
  w(state, `\x1b[${tCol(state, fromRow, 0)}G`);

  w(state, "\x1b[J");

  w(state, state.lines[fromRow]);
  for (let i = fromRow + 1; i < state.lines.length; i++) {
    w(state, "\n" + state.linePrompt + state.lines[i]);
  }

  const endRow = state.lines.length - 1;
  if (endRow > targetRow) w(state, `\x1b[${endRow - targetRow}A`);
  w(state, `\x1b[${tCol(state, targetRow, targetCol)}G`);

  state.row = targetRow;
  state.col = targetCol;

  if (state.statusText) drawStatus(state);
  flushBatch(state);
}

/** Clear screen and redraw all content with in-place rendering to reduce flicker */
export function clearScreen(state: EditorState): void {
  beginBatch(state);
  // Move to top-left and overwrite content in-place instead of clearing first
  if (state.row > 0) w(state, `\x1b[${state.row}A`);
  w(state, "\r");
  w(state, state.prompt + state.lines[0] + "\x1b[K");
  for (let i = 1; i < state.lines.length; i++) {
    w(state, "\n" + state.linePrompt + state.lines[i] + "\x1b[K");
  }
  // Clear any remaining lines below
  w(state, "\x1b[J");
  const endRow = state.lines.length - 1;
  if (endRow > state.row) w(state, `\x1b[${endRow - state.row}A`);
  w(state, `\x1b[${tCol(state, state.row, state.col)}G`);
  if (state.statusText) drawStatus(state);
  flushBatch(state);
}

/** Restore editor state from a snapshot and redraw */
export function restoreSnapshot(state: EditorState, snap: Snapshot): void {
  beginBatch(state);
  state.lines.length = 0;
  state.lines.push(...snap.lines);
  if (state.row > 0) w(state, `\x1b[${state.row}A`);
  w(state, "\r");
  w(state, `\x1b[${pW(state, 0) + 1}G`);
  w(state, "\x1b[J");
  w(state, state.lines[0]);
  for (let i = 1; i < state.lines.length; i++) {
    w(state, "\n" + state.linePrompt + state.lines[i]);
  }
  const endRow = state.lines.length - 1;
  if (endRow > snap.row) w(state, `\x1b[${endRow - snap.row}A`);
  w(state, `\x1b[${tCol(state, snap.row, snap.col)}G`);
  state.row = snap.row;
  state.col = snap.col;
  if (state.statusText) drawStatus(state);
  flushBatch(state);
}

/** Redraw current line after deleting characters of the given display width at cursor */
export function redrawAfterDelete(state: EditorState, deletedWidth: number): void {
  const rest = state.lines[state.row].slice(state.col);
  const restW = stringWidth(rest);
  w(state, `\x1b[${deletedWidth}D${rest}${" ".repeat(deletedWidth)}\x1b[${restW + deletedWidth}D`);
}
