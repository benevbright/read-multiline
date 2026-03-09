export class CancelError extends Error {
  constructor() {
    super("Input cancelled");
    this.name = "CancelError";
  }
}

export class EOFError extends Error {
  constructor() {
    super("EOF received on empty input");
    this.name = "EOFError";
  }
}

export interface ReadMultilineOptions {
  /** Prompt displayed on the first line */
  prompt?: string;

  /** Prompt displayed on continuation lines (2nd line onwards) */
  linePrompt?: string;

  /** Input stream (default: process.stdin) */
  input?: TTYInput;

  /** Output stream (default: process.stdout) */
  output?: NodeJS.WritableStream;

  /** Initial value to pre-populate the input */
  initialValue?: string;

  /** History entries (oldest first). Up/Down at boundaries navigates history. */
  history?: string[];

  /** Maximum number of lines allowed */
  maxLines?: number;

  /** Maximum total character count allowed */
  maxLength?: number;

  /** Validation function. Return an error message string to reject, or undefined/null to accept. */
  validate?: (value: string) => string | undefined | null;

  /** Debounce interval (ms) for live validation after first submit failure (default: 300) */
  validateDebounceMs?: number;

  /**
   * Whether Enter submits the input (default: true).
   * - true: Enter=submit, modified Enter (Shift/Ctrl/Cmd/Alt+Enter, Ctrl+J)=newline
   * - false: Enter=newline, modified Enter=submit
   *
   * Ctrl+J (0x0A) works as a universal fallback in all terminals.
   * Shift+Enter, Ctrl+Enter, Cmd+Enter require the kitty keyboard protocol.
   */
  submitOnEnter?: boolean;

  /**
   * Key combinations to disable.
   * Disabled keys are ignored (neither submit nor newline).
   */
  disabledKeys?: ModifiedEnterKey[];
}

export type ModifiedEnterKey =
  | "shift+enter"
  | "ctrl+enter"
  | "cmd+enter"
  | "alt+enter"
  | "ctrl+j";

export interface TTYInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): void;
}

/**
 * Read multi-line input from the terminal.
 *
 * Key bindings (default, submitOnEnter=true):
 * - Enter: Submit input
 * - Shift+Enter / Ctrl+Enter / Cmd+Enter / Alt+Enter / Ctrl+J: Insert newline
 * - Backspace: Delete character (can merge lines)
 * - Delete: Forward delete character (can merge lines)
 * - Ctrl+U: Delete to line start
 * - Ctrl+K: Delete to line end
 * - Left/Right: Cursor movement (crosses line boundaries)
 * - Up/Down: Move between lines (history at boundaries)
 * - Alt+Left/Right: Word jump
 * - Cmd+Left/Right (Home/End): Jump to line start/end
 * - Cmd+Up/Down: Jump to start/end of entire input
 * - Ctrl+C: Cancel (rejects with CancelError)
 * - Ctrl+D: Submit if input exists, EOF if empty (rejects with EOFError)
 * - Ctrl+L: Clear screen and redraw
 * - Ctrl+W: Delete previous word
 *
 * Shift+Enter and Cmd+Arrow detection uses the kitty keyboard protocol.
 * Supported terminals: kitty, iTerm2, WezTerm, Ghostty, foot, etc.
 *
 * For non-TTY input (pipes), reads all lines until EOF.
 */
export function readMultiline(
  options: ReadMultilineOptions = {},
): Promise<string> {
  const {
    prompt = "",
    linePrompt,
    input = process.stdin as TTYInput,
    output = process.stdout,
  } = options;

  const contPrompt = linePrompt ?? prompt;

  if (!input.isTTY) {
    return readFromPipe(input);
  }

  return readFromTTY(input, output, prompt, contPrompt, options);
}

function readFromPipe(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    input.on("data", (chunk: Buffer | string) => {
      data += typeof chunk === "string" ? chunk : chunk.toString();
    });
    input.on("end", () => {
      resolve(data.endsWith("\n") ? data.slice(0, -1) : data);
    });
  });
}

function isWordChar(ch: string): boolean {
  if (/\w/.test(ch)) return true;
  // Treat full-width characters (CJK, etc.) as word characters
  return charWidth(ch.codePointAt(0)!) === 2;
}

/** Returns the terminal display width of a character (full-width=2, half-width=1) */
function charWidth(code: number): number {
  if (code < 32) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33bf) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/** Returns the terminal display width of a string */
function stringWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    width += charWidth(ch.codePointAt(0)!);
  }
  return width;
}

/** Returns the character at the given code unit index (surrogate pair aware) */
function charAtIndex(str: string, index: number): string {
  const code = str.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < str.length) {
    return str.slice(index, index + 2);
  }
  return str[index];
}

/** Returns the character just before the given code unit index (surrogate pair aware) */
function charBeforeIndex(str: string, index: number): string {
  const code = str.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) {
    return str.slice(index - 2, index);
  }
  return str[index - 1];
}

/** Count total characters across all lines (join with newlines) */
function contentLength(lines: string[]): number {
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) len++; // newline separator
    len += [...lines[i]].length;
  }
  return len;
}

function readFromTTY(
  input: TTYInput,
  output: NodeJS.WritableStream,
  prompt: string,
  linePrompt: string,
  options: ReadMultilineOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const {
      initialValue,
      history: historyEntries,
      maxLines,
      maxLength,
      validate,
      validateDebounceMs = 300,
      submitOnEnter = true,
      disabledKeys = [],
    } = options;

    const lines: string[] = [""];
    let row = 0;
    let col = 0;

    const promptWidth = stringWidth(prompt);
    const linePromptWidth = stringWidth(linePrompt);
    const pW = (r: number) => (r === 0 ? promptWidth : linePromptWidth);

    // 1-based terminal column from line start to code unit index c, accounting for display width
    const tCol = (r: number, c: number) =>
      pW(r) + stringWidth(lines[r].slice(0, c)) + 1;

    function w(text: string) {
      output.write(text);
    }

    // --- Status line (validation / limit errors) ---

    let statusText = "";
    let statusColor: "red" | "green" | "" = "";

    function drawStatus() {
      if (!statusText) return;
      // Move to end of content, then one line below
      const endRow = lines.length - 1;
      const dr = endRow - row;
      if (dr > 0) w(`\x1b[${dr}B`);
      else if (dr < 0) w(`\x1b[${-dr}A`);
      w("\r\n");
      // Color
      if (statusColor === "red") w("\x1b[31m");
      else if (statusColor === "green") w("\x1b[32m");
      w(statusText);
      if (statusColor) w("\x1b[0m");
      w("\x1b[K"); // clear rest of line
      // Move back to cursor position
      w(`\x1b[${endRow - row + 1 + 1}A`); // go up to original row (we moved to endRow then +1)
      // Actually, let's recalculate: we are now at endRow+1 (status line), need to go to `row`
      const linesDown = endRow + 1; // status line row index (0-based from first line)
      const upCount = linesDown - row;
      if (upCount > 0) w(`\x1b[${upCount}A`);
      w(`\x1b[${tCol(row, col)}G`);
    }

    function clearStatus() {
      if (!statusText) return;
      // Move to status line and clear it
      const endRow = lines.length - 1;
      const dr = endRow - row;
      if (dr > 0) w(`\x1b[${dr}B`);
      else if (dr < 0) w(`\x1b[${-dr}A`);
      w("\r\n\x1b[K"); // next line, clear it
      // Move back
      const upCount = endRow + 1 - row;
      if (upCount > 0) w(`\x1b[${upCount}A`);
      w(`\x1b[${tCol(row, col)}G`);
      statusText = "";
      statusColor = "";
    }

    function setStatus(text: string, color: "red" | "green" | "") {
      clearStatus();
      statusText = text;
      statusColor = color;
      if (text) drawStatus();
    }

    // --- History ---

    const history = historyEntries ? [...historyEntries] : [];
    let historyIndex = history.length; // points past end = current draft
    let draft: string = initialValue ?? ""; // save current input when navigating history

    function loadContent(content: string) {
      // Clear current content and load new content
      const newLines = content.split("\n");
      // Move to (0, 0) visually
      if (row > 0) w(`\x1b[${row}A`);
      w("\r");
      // Clear from prompt start
      w(`\x1b[${pW(0) + 1}G`);
      w("\x1b[J");
      // Set new lines
      lines.length = 0;
      lines.push(...newLines);
      // Draw content
      w(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        w("\n" + linePrompt + lines[i]);
      }
      // Place cursor at end
      row = lines.length - 1;
      col = lines[row].length;
      w(`\x1b[${tCol(row, col)}G`);
    }

    function historyPrev() {
      if (historyIndex <= 0) return;
      if (historyIndex === history.length) {
        draft = lines.join("\n");
      }
      historyIndex--;
      loadContent(history[historyIndex]);
    }

    function historyNext() {
      if (historyIndex >= history.length) return;
      historyIndex++;
      if (historyIndex === history.length) {
        loadContent(draft);
      } else {
        loadContent(history[historyIndex]);
      }
    }

    // --- Validation ---

    let validationActive = false;
    let validateTimer: ReturnType<typeof setTimeout> | null = null;

    function runValidation(): string | undefined | null {
      if (!validate) return undefined;
      return validate(lines.join("\n"));
    }

    function scheduleValidation() {
      if (!validationActive || !validate) return;
      if (validateTimer) clearTimeout(validateTimer);
      validateTimer = setTimeout(() => {
        validateTimer = null;
        const error = runValidation();
        if (error) {
          setStatus(error, "red");
        } else {
          setStatus("OK", "green");
        }
      }, validateDebounceMs);
    }

    function onContentChanged() {
      // Check limits and show error
      if (maxLength != null) {
        const len = contentLength(lines);
        if (len >= maxLength) {
          setStatus(`Maximum ${maxLength} characters`, "red");
          return;
        }
      }
      if (maxLines != null && lines.length >= maxLines) {
        // Only show if they just hit the limit
        // Actually, we don't need to persistently show this - clear any limit error
      }

      // Schedule validation if active
      if (validationActive) {
        scheduleValidation();
      } else {
        clearStatus();
      }
    }

    // Move terminal cursor from (row, col) to (newRow, newCol)
    function moveTo(newRow: number, newCol: number) {
      const dr = newRow - row;
      if (dr < 0) w(`\x1b[${-dr}A`);
      else if (dr > 0) w(`\x1b[${dr}B`);
      w(`\x1b[${tCol(newRow, newCol)}G`);
      row = newRow;
      col = newCol;
    }

    // Redraw from fromRow onwards and place terminal cursor at (targetRow, targetCol)
    function redrawFrom(
      fromRow: number,
      targetRow: number,
      targetCol: number,
    ) {
      // Move cursor to content start of fromRow
      const dr = row - fromRow;
      if (dr > 0) w(`\x1b[${dr}A`);
      else if (dr < 0) w(`\x1b[${-dr}B`);
      w(`\x1b[${tCol(fromRow, 0)}G`);

      // Clear to end of screen
      w("\x1b[J");

      // Redraw
      w(lines[fromRow]);
      for (let i = fromRow + 1; i < lines.length; i++) {
        w("\n" + linePrompt + lines[i]);
      }

      // Move terminal cursor to target position
      const endRow = lines.length - 1;
      if (endRow > targetRow) w(`\x1b[${endRow - targetRow}A`);
      w(`\x1b[${tCol(targetRow, targetCol)}G`);

      row = targetRow;
      col = targetCol;

      // Redraw status if present
      if (statusText) drawStatus();
    }

    // --- Editing operations ---

    function canInsertChar(charCount: number = 1): boolean {
      if (maxLength != null) {
        const len = contentLength(lines);
        if (len + charCount > maxLength) {
          setStatus(`Maximum ${maxLength} characters`, "red");
          return false;
        }
      }
      return true;
    }

    function canInsertNewline(): boolean {
      if (maxLines != null && lines.length >= maxLines) {
        setStatus(`Maximum ${maxLines} lines`, "red");
        return false;
      }
      if (maxLength != null) {
        // A newline adds one to content length
        const len = contentLength(lines);
        if (len + 1 > maxLength) {
          setStatus(`Maximum ${maxLength} characters`, "red");
          return false;
        }
      }
      return true;
    }

    function insertChar(ch: string) {
      if (!canInsertChar([...ch].length)) return;
      lines[row] = lines[row].slice(0, col) + ch + lines[row].slice(col);
      col += ch.length;
      const rest = lines[row].slice(col);
      w(ch + rest);
      const restW = stringWidth(rest);
      if (restW > 0) w(`\x1b[${restW}D`);
      onContentChanged();
    }

    function insertNewline() {
      if (!canInsertNewline()) return;
      const after = lines[row].slice(col);
      lines[row] = lines[row].slice(0, col);
      lines.splice(row + 1, 0, after);
      // Don't update row/col yet (redrawFrom uses them as current terminal position)
      redrawFrom(row, row + 1, 0);
      onContentChanged();
    }

    // Redraw current line after deleting characters of the given display width at cursor
    function redrawAfterDelete(deletedWidth: number) {
      const rest = lines[row].slice(col);
      const restW = stringWidth(rest);
      w(`\x1b[${deletedWidth}D${rest}${" ".repeat(deletedWidth)}\x1b[${restW + deletedWidth}D`);
    }

    function handleBackspace() {
      if (col > 0) {
        const deleted = charBeforeIndex(lines[row], col);
        col -= deleted.length;
        lines[row] =
          lines[row].slice(0, col) + lines[row].slice(col + deleted.length);
        redrawAfterDelete(charWidth(deleted.codePointAt(0)!));
        onContentChanged();
      } else if (row > 0) {
        const prevLen = lines[row - 1].length;
        lines[row - 1] += lines[row];
        lines.splice(row, 1);
        // Don't update row/col yet (redrawFrom uses them as current terminal position)
        redrawFrom(row - 1, row - 1, prevLen);
        onContentChanged();
      }
    }

    function handleDelete() {
      if (col < lines[row].length) {
        const deleted = charAtIndex(lines[row], col);
        lines[row] =
          lines[row].slice(0, col) + lines[row].slice(col + deleted.length);
        // Redraw rest of line
        const rest = lines[row].slice(col);
        const restW = stringWidth(rest);
        const deletedW = charWidth(deleted.codePointAt(0)!);
        w(`${rest}${" ".repeat(deletedW)}`);
        if (restW + deletedW > 0) w(`\x1b[${restW + deletedW}D`);
        onContentChanged();
      } else if (row < lines.length - 1) {
        // Merge next line into current
        lines[row] += lines[row + 1];
        lines.splice(row + 1, 1);
        redrawFrom(row, row, col);
        onContentChanged();
      }
    }

    function deleteToLineStart() {
      if (col === 0) return;
      const deletedWidth = stringWidth(lines[row].slice(0, col));
      lines[row] = lines[row].slice(col);
      col = 0;
      // Move to start, rewrite line, clear remainder
      w(`\x1b[${pW(row) + 1}G`);
      w(lines[row]);
      w(" ".repeat(deletedWidth));
      w(`\x1b[${pW(row) + 1}G`);
      onContentChanged();
    }

    function deleteToLineEnd() {
      if (col >= lines[row].length) return;
      lines[row] = lines[row].slice(0, col);
      w("\x1b[K"); // clear to end of line
      onContentChanged();
    }

    function deleteWordBack() {
      if (col === 0) {
        // At line start, merge with previous line (same as backspace)
        handleBackspace();
        return;
      }
      const line = lines[row];
      let c = col;
      // Skip non-word characters before cursor
      while (c > 0 && !isWordChar(charBeforeIndex(line, c))) {
        c -= charBeforeIndex(line, c).length;
      }
      // Skip word characters
      while (c > 0 && isWordChar(charBeforeIndex(line, c))) {
        c -= charBeforeIndex(line, c).length;
      }
      const deletedWidth = stringWidth(line.slice(c, col));
      lines[row] = line.slice(0, c) + line.slice(col);
      col = c;
      redrawAfterDelete(deletedWidth);
      onContentChanged();
    }

    // --- Clear screen ---

    function clearScreen() {
      // Clear entire screen, move cursor to top-left
      w("\x1b[2J\x1b[H");
      // Redraw prompt and content
      w(prompt + lines[0]);
      for (let i = 1; i < lines.length; i++) {
        w("\n" + linePrompt + lines[i]);
      }
      // Place cursor
      const endRow = lines.length - 1;
      if (endRow > row) w(`\x1b[${endRow - row}A`);
      w(`\x1b[${tCol(row, col)}G`);
      // Redraw status if present
      if (statusText) drawStatus();
    }

    // --- Cursor movement ---

    function moveLeft() {
      if (col > 0) {
        const ch = charBeforeIndex(lines[row], col);
        const cw = charWidth(ch.codePointAt(0)!);
        col -= ch.length;
        w(cw > 1 ? `\x1b[${cw}D` : "\x1b[D");
      } else if (row > 0) {
        moveTo(row - 1, lines[row - 1].length);
      }
    }

    function moveRight() {
      if (col < lines[row].length) {
        const ch = charAtIndex(lines[row], col);
        const cw = charWidth(ch.codePointAt(0)!);
        col += ch.length;
        w(cw > 1 ? `\x1b[${cw}C` : "\x1b[C");
      } else if (row < lines.length - 1) {
        moveTo(row + 1, 0);
      }
    }

    function moveUp() {
      if (row > 0) {
        moveTo(row - 1, Math.min(col, lines[row - 1].length));
      }
    }

    function moveDown() {
      if (row < lines.length - 1) {
        moveTo(row + 1, Math.min(col, lines[row + 1].length));
      }
    }

    // Up/Down with history support at boundaries
    function moveUpOrHistory() {
      if (row > 0) {
        moveUp();
      } else if (history.length > 0) {
        historyPrev();
      }
    }

    function moveDownOrHistory() {
      if (row < lines.length - 1) {
        moveDown();
      } else if (historyIndex < history.length) {
        historyNext();
      }
    }

    // --- Word jump (Alt+Arrow) ---

    function wordRight() {
      let r = row,
        c = col;
      // Skip non-word characters
      while (r < lines.length) {
        const line = lines[r];
        while (c < line.length && !isWordChar(line[c])) c++;
        if (c < line.length) break;
        if (r < lines.length - 1) {
          r++;
          c = 0;
        } else break;
      }
      // Skip word characters
      const line = lines[r];
      while (c < line.length && isWordChar(line[c])) c++;

      if (r !== row || c !== col) moveTo(r, c);
    }

    function wordLeft() {
      let r = row,
        c = col;
      // Step back one
      if (c > 0) {
        c--;
      } else if (r > 0) {
        r--;
        c = lines[r].length;
        if (c > 0) c--;
        else {
          moveTo(r, 0);
          return;
        }
      } else return;

      // Skip non-word characters
      while (true) {
        let line = lines[r];
        while (c > 0 && !isWordChar(line[c])) c--;
        if (isWordChar(line[c])) break;
        if (r > 0) {
          r--;
          c = lines[r].length - 1;
          if (c < 0) {
            c = 0;
            break;
          }
        } else {
          c = 0;
          break;
        }
      }
      // Skip word characters
      const line = lines[r];
      while (c > 0 && isWordChar(line[c - 1])) c--;

      moveTo(r, c);
    }

    // --- Line start/end, buffer start/end (Cmd+Arrow, Home/End) ---

    function lineStart() {
      if (col !== 0) moveTo(row, 0);
    }

    function lineEnd() {
      if (col !== lines[row].length) moveTo(row, lines[row].length);
    }

    function bufferStart() {
      if (row !== 0 || col !== 0) moveTo(0, 0);
    }

    function bufferEnd() {
      const lastRow = lines.length - 1;
      const lastCol = lines[lastRow].length;
      if (row !== lastRow || col !== lastCol) moveTo(lastRow, lastCol);
    }

    // --- Key map ---

    const keyMap: Record<string, () => void> = {};
    const disabled = new Set(disabledKeys);

    // Enter key: submit or newline based on submitOnEnter
    const enterAction = submitOnEnter ? submit : insertNewline;
    const modifiedAction = submitOnEnter ? insertNewline : submit;

    keyMap["\r"] = enterAction;
    keyMap["\x1b[13u"] = enterAction; // kitty Enter

    // Modified Enter keys: opposite of Enter (unless disabled)
    const modifiedEnterKeys: Record<ModifiedEnterKey, string[]> = {
      "shift+enter": ["\x1b[13;2u"],
      "ctrl+enter": ["\x1b[13;5u"],
      "cmd+enter": ["\x1b[13;9u"],
      "alt+enter": ["\x1b\r", "\x1b[13;3u"],
      "ctrl+j": ["\n"],
    };

    for (const [name, seqs] of Object.entries(modifiedEnterKeys)) {
      if (!disabled.has(name as ModifiedEnterKey)) {
        for (const seq of seqs) {
          keyMap[seq] = modifiedAction;
        }
      }
    }

    // Cancel / EOF
    Object.assign(keyMap, {
      "\x03": cancel, // Ctrl+C
      "\x1b[99;5u": cancel, // kitty Ctrl+C
      "\x04": handleEOF, // Ctrl+D
      "\x1b[100;5u": handleEOF, // kitty Ctrl+D

      // Editing
      "\x7f": handleBackspace,
      "\b": handleBackspace,
      "\x17": deleteWordBack, // Ctrl+W
      "\x1b[119;5u": deleteWordBack, // kitty Ctrl+W
      "\x1b[3~": handleDelete, // Delete key
      "\x15": deleteToLineStart, // Ctrl+U
      "\x1b[117;5u": deleteToLineStart, // kitty Ctrl+U
      "\x0b": deleteToLineEnd, // Ctrl+K
      "\x1b[107;5u": deleteToLineEnd, // kitty Ctrl+K

      // Clear screen
      "\x0c": clearScreen, // Ctrl+L
      "\x1b[108;5u": clearScreen, // kitty Ctrl+L

      // Arrow keys (with history support)
      "\x1b[A": moveUpOrHistory,
      "\x1b[B": moveDownOrHistory,
      "\x1b[C": moveRight,
      "\x1b[D": moveLeft,

      // Alt+Arrow (word jump) modifier 3 = Alt
      "\x1b[1;3C": wordRight,
      "\x1b[1;3D": wordLeft,
      "\x1b[1;3A": moveUp,
      "\x1b[1;3B": moveDown,

      // Ctrl+Arrow (word jump) modifier 5 = Ctrl
      "\x1b[1;5C": wordRight,
      "\x1b[1;5D": wordLeft,
      "\x1b[1;5A": moveUp,
      "\x1b[1;5B": moveDown,

      // macOS Option+Arrow (sent as ESC+b/f)
      "\x1bb": wordLeft, // ESC+b (backward-word)
      "\x1bf": wordRight, // ESC+f (forward-word)

      // Cmd+Arrow (kitty protocol: super modifier = 9)
      "\x1b[1;9D": lineStart,
      "\x1b[1;9C": lineEnd,
      "\x1b[1;9A": bufferStart,
      "\x1b[1;9B": bufferEnd,

      // Cmd+Arrow (macOS: sent as Ctrl+A/E)
      "\x01": lineStart, // Ctrl+A
      "\x1b[97;5u": lineStart, // kitty Ctrl+A
      "\x05": lineEnd, // Ctrl+E
      "\x1b[101;5u": lineEnd, // kitty Ctrl+E

      // Home/End
      "\x1b[H": lineStart,
      "\x1b[F": lineEnd,
    });

    // --- Initialization ---

    if (prompt) w(prompt);

    // Load initial value
    if (initialValue) {
      const initLines = initialValue.split("\n");
      lines.length = 0;
      lines.push(...initLines);
      w(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        w("\n" + linePrompt + lines[i]);
      }
      row = lines.length - 1;
      col = lines[row].length;
    }

    input.setRawMode?.(true);
    input.resume();
    w("\x1b[>1u"); // Enable kitty keyboard protocol
    w("\x1b[?2004h"); // Enable bracketed paste mode

    // --- Resize handling ---

    let resizeHandler: (() => void) | null = null;
    const ttyOutput = output as NodeJS.WriteStream;
    if (typeof ttyOutput.on === "function" && "columns" in ttyOutput) {
      resizeHandler = () => {
        // Full redraw on resize
        clearScreen();
      };
      ttyOutput.on("resize", resizeHandler);
    }

    function cleanup() {
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = null;
      }
      if (validateTimer) {
        clearTimeout(validateTimer);
        validateTimer = null;
      }
      if (resizeHandler && typeof ttyOutput.removeListener === "function") {
        ttyOutput.removeListener("resize", resizeHandler);
      }
      clearStatus();
      w("\x1b[?2004l"); // Disable bracketed paste mode
      w("\x1b[<u"); // Disable kitty protocol
      input.setRawMode?.(false);
      input.removeListener("data", onData);
      input.pause();
    }

    function submit() {
      // Run validation if configured
      if (validate) {
        const error = runValidation();
        if (error) {
          validationActive = true;
          setStatus(error, "red");
          return; // Don't submit
        }
      }
      cleanup();
      w("\n");
      resolve(lines.join("\n"));
    }

    function handleEOF() {
      const content = lines.join("\n");
      if (content.length === 0) {
        cleanup();
        w("\n");
        reject(new EOFError());
      } else {
        submit();
      }
    }

    function cancel() {
      cleanup();
      w("\n");
      reject(new CancelError());
    }

    // Buffer ESC when it arrives alone, waiting for subsequent bytes to form a sequence
    let escBuffer = "";
    let escTimer: ReturnType<typeof setTimeout> | null = null;
    const ESC_TIMEOUT = 50; // ms

    function flushEscBuffer() {
      escTimer = null;
      const buf = escBuffer;
      escBuffer = "";
      // Look up the buffered sequence in the key map
      const handler = keyMap[buf];
      if (handler) {
        handler();
      }
      // Discard if no match (unknown escape sequence)
    }

    // --- Paste handling ---

    const PASTE_START = "\x1b[200~";
    const PASTE_END = "\x1b[201~";
    let isPasting = false;

    function processPaste(text: string) {
      // Normalize line endings: \r\n -> \n, \r -> \n
      const normalized = text.replace(/\r\n|\r/g, "\n");
      for (const ch of normalized) {
        if (ch === "\n") {
          insertNewline();
        } else if (ch.charCodeAt(0) >= 32) {
          insertChar(ch);
        }
      }
    }

    function processInput(seq: string) {
      // Paste start marker
      const startIdx = seq.indexOf(PASTE_START);
      if (startIdx !== -1) {
        if (startIdx > 0) processInput(seq.slice(0, startIdx));
        isPasting = true;
        const after = seq.slice(startIdx + PASTE_START.length);
        if (after) processInput(after);
        return;
      }

      // Paste end marker
      const endIdx = seq.indexOf(PASTE_END);
      if (endIdx !== -1) {
        if (endIdx > 0) processPaste(seq.slice(0, endIdx));
        isPasting = false;
        const after = seq.slice(endIdx + PASTE_END.length);
        if (after) processInput(after);
        return;
      }

      // During paste, insert everything as text
      if (isPasting) {
        processPaste(seq);
        return;
      }

      // Normal key processing
      const handler = keyMap[seq];
      if (handler) {
        handler();
        return;
      }

      // Ignore unknown escape sequences
      if (seq.startsWith("\x1b")) return;

      // Regular characters
      for (const ch of seq) {
        if (ch.charCodeAt(0) >= 32) insertChar(ch);
      }
    }

    function onData(data: Buffer) {
      const seq = data.toString();

      // If ESC buffer has pending data, combine with new data
      if (escBuffer) {
        if (escTimer) {
          clearTimeout(escTimer);
          escTimer = null;
        }
        const combined = escBuffer + seq;
        escBuffer = "";
        processInput(combined);
        return;
      }

      // If ESC arrives alone, buffer it and wait for subsequent bytes
      if (seq === "\x1b") {
        escBuffer = seq;
        escTimer = setTimeout(flushEscBuffer, ESC_TIMEOUT);
        return;
      }

      processInput(seq);
    }

    input.on("data", onData);
  });
}

export default readMultiline;
