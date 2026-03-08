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
}

export interface TTYInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): void;
}

/**
 * Read multi-line input from the terminal.
 *
 * Key bindings:
 * - Enter: Submit input
 * - Shift+Enter: Insert newline
 * - Backspace: Delete character (can merge lines)
 * - Left/Right: Cursor movement (crosses line boundaries)
 * - Up/Down: Move between lines
 * - Alt+Left/Right: Word jump
 * - Cmd+Left/Right (Home/End): Jump to line start/end
 * - Cmd+Up/Down: Jump to start/end of entire input
 * - Ctrl+C: Cancel (rejects with CancelError)
 * - Ctrl+D: Submit if input exists, EOF if empty (rejects with EOFError)
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

  return readFromTTY(input, output, prompt, contPrompt);
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

function readFromTTY(
  input: TTYInput,
  output: NodeJS.WritableStream,
  prompt: string,
  linePrompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
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
        w("\n" + (i === 0 ? prompt : linePrompt) + lines[i]);
      }

      // Move terminal cursor to target position
      const endRow = lines.length - 1;
      if (endRow > targetRow) w(`\x1b[${endRow - targetRow}A`);
      w(`\x1b[${tCol(targetRow, targetCol)}G`);

      row = targetRow;
      col = targetCol;
    }

    // --- Editing operations ---

    function insertChar(ch: string) {
      lines[row] = lines[row].slice(0, col) + ch + lines[row].slice(col);
      col += ch.length;
      const rest = lines[row].slice(col);
      w(ch + rest);
      const restW = stringWidth(rest);
      if (restW > 0) w(`\x1b[${restW}D`);
    }

    function insertNewline() {
      const after = lines[row].slice(col);
      lines[row] = lines[row].slice(0, col);
      lines.splice(row + 1, 0, after);
      // Don't update row/col yet (redrawFrom uses them as current terminal position)
      redrawFrom(row, row + 1, 0);
    }

    function handleBackspace() {
      if (col > 0) {
        const deleted = charBeforeIndex(lines[row], col);
        const dw = charWidth(deleted.codePointAt(0)!);
        col -= deleted.length;
        lines[row] =
          lines[row].slice(0, col) + lines[row].slice(col + deleted.length);
        const rest = lines[row].slice(col);
        const restW = stringWidth(rest);
        // Move back by deleted char width, redraw rest, clear trailing artifact
        w(`\x1b[${dw}D${rest}${" ".repeat(dw)}\x1b[${restW + dw}D`);
      } else if (row > 0) {
        const prevLen = lines[row - 1].length;
        lines[row - 1] += lines[row];
        lines.splice(row, 1);
        // Don't update row/col yet (redrawFrom uses them as current terminal position)
        redrawFrom(row - 1, row - 1, prevLen);
      }
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
      const rest = lines[row].slice(col);
      const restW = stringWidth(rest);
      w(`\x1b[${deletedWidth}D${rest}${" ".repeat(deletedWidth)}\x1b[${restW + deletedWidth}D`);
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

    // --- Word jump (Alt+Arrow) ---

    function wordRight() {
      let r = row,
        c = col;
      // Skip non-word characters
      while (r < lines.length) {
        while (c < lines[r].length && !isWordChar(lines[r][c])) c++;
        if (c < lines[r].length) break;
        if (r < lines.length - 1) {
          r++;
          c = 0;
        } else break;
      }
      // Skip word characters
      while (r < lines.length && c < lines[r].length && isWordChar(lines[r][c]))
        c++;

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
        while (c > 0 && !isWordChar(lines[r][c])) c--;
        if (isWordChar(lines[r][c])) break;
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
      while (c > 0 && isWordChar(lines[r][c - 1])) c--;

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

    const keyMap: Record<string, () => void> = {
      // Submit / Cancel
      "\r": submit,
      "\x1b[13u": submit, // kitty Enter
      "\x1b[13;2u": insertNewline, // Shift+Enter
      "\x03": cancel, // Ctrl+C
      "\x1b[99;5u": cancel, // kitty Ctrl+C
      "\x04": handleEOF, // Ctrl+D
      "\x1b[100;5u": handleEOF, // kitty Ctrl+D

      // Editing
      "\x7f": handleBackspace,
      "\b": handleBackspace,
      "\x17": deleteWordBack, // Ctrl+W
      "\x1b[119;5u": deleteWordBack, // kitty Ctrl+W

      // Arrow keys
      "\x1b[A": moveUp,
      "\x1b[B": moveDown,
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
    };

    // --- Initialization ---

    if (prompt) w(prompt);
    input.setRawMode?.(true);
    input.resume();
    w("\x1b[>1u"); // Enable kitty keyboard protocol
    w("\x1b[?2004h"); // Enable bracketed paste mode

    function cleanup() {
      w("\x1b[?2004l"); // Disable bracketed paste mode
      w("\x1b[<u"); // Disable kitty protocol
      input.setRawMode?.(false);
      input.removeListener("data", onData);
      input.pause();
    }

    function submit() {
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
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
