import {
  deleteToLineEnd,
  deleteToLineStart,
  deleteWordBack,
  handleBackspace,
  handleDelete,
  insertChar,
  insertNewline,
  redo,
  saveUndo,
  undo,
} from "./editing.js";
import {
  bufferEnd,
  bufferStart,
  lineEnd,
  lineStart,
  moveDown,
  moveDownOrHistory,
  moveLeft,
  moveRight,
  moveUp,
  moveUpOrHistory,
  wordLeft,
  wordRight,
} from "./navigation.js";
import { clearScreen } from "./rendering.js";
import type { EditorState, ModifiedEnterKey } from "./types.js";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const ESC_TIMEOUT = 50; // ms

/** Build the key-to-action mapping based on options and callbacks */
export function buildKeyMap(
  state: EditorState,
  submit: () => void,
  cancel: () => void,
  handleEOF: () => void,
): void {
  const keyMap = state.keyMap;

  // Enter key: submit or newline based on submitOnEnter
  const enterAction = state.submitOnEnter ? submit : () => insertNewline(state);
  const modifiedAction = state.submitOnEnter ? () => insertNewline(state) : submit;

  keyMap["\r"] = enterAction;
  keyMap["\x1b[13u"] = enterAction; // kitty Enter

  // Modified Enter keys
  const modifiedEnterKeys: Record<ModifiedEnterKey, string[]> = {
    "shift+enter": ["\x1b[13;2u"],
    "ctrl+enter": ["\x1b[13;5u"],
    "cmd+enter": ["\x1b[13;9u"],
    "alt+enter": ["\x1b\r", "\x1b[13;3u"],
    "ctrl+j": ["\n"],
  };

  for (const [name, seqs] of Object.entries(modifiedEnterKeys)) {
    if (!state.disabledKeys.has(name as ModifiedEnterKey)) {
      for (const seq of seqs) {
        keyMap[seq] = modifiedAction;
      }
    }
  }

  // Cancel / EOF
  keyMap["\x03"] = cancel; // Ctrl+C
  keyMap["\x1b[99;5u"] = cancel; // kitty Ctrl+C
  keyMap["\x04"] = handleEOF; // Ctrl+D
  keyMap["\x1b[100;5u"] = handleEOF; // kitty Ctrl+D

  // Editing
  keyMap["\x7f"] = () => handleBackspace(state);
  keyMap["\b"] = () => handleBackspace(state);
  keyMap["\x17"] = () => deleteWordBack(state); // Ctrl+W
  keyMap["\x1b[119;5u"] = () => deleteWordBack(state); // kitty Ctrl+W
  keyMap["\x1b[3~"] = () => handleDelete(state); // Delete key
  keyMap["\x15"] = () => deleteToLineStart(state); // Ctrl+U
  keyMap["\x1b[117;5u"] = () => deleteToLineStart(state); // kitty Ctrl+U
  keyMap["\x0b"] = () => deleteToLineEnd(state); // Ctrl+K
  keyMap["\x1b[107;5u"] = () => deleteToLineEnd(state); // kitty Ctrl+K

  // Undo / Redo
  keyMap["\x1a"] = () => undo(state); // Ctrl+Z
  keyMap["\x1b[122;5u"] = () => undo(state); // kitty Ctrl+Z
  keyMap["\x1b[122;9u"] = () => undo(state); // kitty Cmd+Z
  keyMap["\x1b[122;6u"] = () => redo(state); // kitty Ctrl+Shift+Z
  keyMap["\x1b[122;10u"] = () => redo(state); // kitty Cmd+Shift+Z
  keyMap["\x19"] = () => redo(state); // Ctrl+Y
  keyMap["\x1b[121;5u"] = () => redo(state); // kitty Ctrl+Y
  keyMap["\x1b[121;9u"] = () => redo(state); // kitty Cmd+Y

  // Clear screen
  keyMap["\x0c"] = () => clearScreen(state); // Ctrl+L
  keyMap["\x1b[108;5u"] = () => clearScreen(state); // kitty Ctrl+L

  // Arrow keys (with history support)
  keyMap["\x1b[A"] = () => moveUpOrHistory(state);
  keyMap["\x1b[B"] = () => moveDownOrHistory(state);
  keyMap["\x1b[C"] = () => moveRight(state);
  keyMap["\x1b[D"] = () => moveLeft(state);

  // Alt+Arrow (word jump)
  keyMap["\x1b[1;3C"] = () => wordRight(state);
  keyMap["\x1b[1;3D"] = () => wordLeft(state);
  keyMap["\x1b[1;3A"] = () => moveUp(state);
  keyMap["\x1b[1;3B"] = () => moveDown(state);

  // Ctrl+Arrow (word jump)
  keyMap["\x1b[1;5C"] = () => wordRight(state);
  keyMap["\x1b[1;5D"] = () => wordLeft(state);
  keyMap["\x1b[1;5A"] = () => moveUp(state);
  keyMap["\x1b[1;5B"] = () => moveDown(state);

  // macOS Option+Arrow
  keyMap["\x1bb"] = () => wordLeft(state); // ESC+b
  keyMap["\x1bf"] = () => wordRight(state); // ESC+f

  // Cmd+Arrow (kitty protocol: super modifier = 9)
  keyMap["\x1b[1;9D"] = () => lineStart(state);
  keyMap["\x1b[1;9C"] = () => lineEnd(state);
  keyMap["\x1b[1;9A"] = () => bufferStart(state);
  keyMap["\x1b[1;9B"] = () => bufferEnd(state);

  // Cmd+Arrow (macOS: sent as Ctrl+A/E)
  keyMap["\x01"] = () => lineStart(state); // Ctrl+A
  keyMap["\x1b[97;5u"] = () => lineStart(state); // kitty Ctrl+A
  keyMap["\x05"] = () => lineEnd(state); // Ctrl+E
  keyMap["\x1b[101;5u"] = () => lineEnd(state); // kitty Ctrl+E

  // Home/End
  keyMap["\x1b[H"] = () => lineStart(state);
  keyMap["\x1b[F"] = () => lineEnd(state);
}

// --- Paste handling ---

function processPaste(state: EditorState, text: string): void {
  const normalized = text.replace(/\r\n|\r/g, "\n");
  for (const ch of normalized) {
    if (ch === "\n") {
      insertNewline(state);
    } else if (ch.charCodeAt(0) >= 32) {
      insertChar(state, ch);
    }
  }
}

/** Process an input sequence: handle paste markers, key map lookups, and character insertion */
export function processInput(state: EditorState, seq: string): void {
  // Paste start marker
  const startIdx = seq.indexOf(PASTE_START);
  if (startIdx !== -1) {
    if (startIdx > 0) processInput(state, seq.slice(0, startIdx));
    saveUndo(state);
    state.isPasting = true;
    const after = seq.slice(startIdx + PASTE_START.length);
    if (after) processInput(state, after);
    return;
  }

  // Paste end marker
  const endIdx = seq.indexOf(PASTE_END);
  if (endIdx !== -1) {
    if (endIdx > 0) processPaste(state, seq.slice(0, endIdx));
    state.isPasting = false;
    const after = seq.slice(endIdx + PASTE_END.length);
    if (after) processInput(state, after);
    return;
  }

  // During paste, insert everything as text
  if (state.isPasting) {
    processPaste(state, seq);
    return;
  }

  // Normal key processing
  const handler = state.keyMap[seq];
  if (handler) {
    handler();
    return;
  }

  // Ignore unknown escape sequences
  if (seq.startsWith("\x1b")) return;

  // Regular characters
  for (const ch of seq) {
    if (ch.charCodeAt(0) >= 32) insertChar(state, ch);
  }
}

function flushEscBuffer(state: EditorState): void {
  state.escTimer = null;
  const buf = state.escBuffer;
  state.escBuffer = "";
  const handler = state.keyMap[buf];
  if (handler) {
    handler();
  }
}

/** Handle raw data from the input stream, buffering ESC sequences as needed */
export function onData(state: EditorState, data: Buffer): void {
  const seq = data.toString();

  if (state.escBuffer) {
    if (state.escTimer) {
      clearTimeout(state.escTimer);
      state.escTimer = null;
    }
    const combined = state.escBuffer + seq;
    state.escBuffer = "";
    processInput(state, combined);
    return;
  }

  if (seq === "\x1b") {
    state.escBuffer = seq;
    state.escTimer = setTimeout(() => flushEscBuffer(state), ESC_TIMEOUT);
    return;
  }

  processInput(state, seq);
}
