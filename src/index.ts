import { stringWidth } from "./chars.js";
import { handleDelete } from "./editing.js";
import { buildHelpFooter, detectKittyProtocol } from "./footer.js";
import { buildKeyMap, onData } from "./input.js";
import { clearBelowEditor, clearScreen, setFooter, setStatus, tCol, w } from "./rendering.js";
import type { EditorState, ReadMultilineOptions, TTYInput } from "./types.js";
import { CancelError, EOFError } from "./types.js";

export { CancelError, EOFError } from "./types.js";
export type {
  HelpFooterAction,
  HelpFooterDisplayOptions,
  ModifiedEnterKey,
  ReadMultilineOptions,
  TTYInput,
} from "./types.js";

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
 * - Ctrl+D: Delete character at cursor (same as Delete key), EOF if empty (rejects with EOFError)
 * - Ctrl+L: Clear screen and redraw
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z / Ctrl+Y: Redo
 * - Ctrl+W: Delete previous word
 *
 * Shift+Enter and Cmd+Arrow detection uses the kitty keyboard protocol.
 * Supported terminals: kitty, iTerm2, WezTerm, Ghostty, foot, etc.
 *
 * For non-TTY input (pipes), reads all lines until EOF.
 */
export function readMultiline(options: ReadMultilineOptions = {}): Promise<string> {
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
      footer,
      helpFooter = true,
    } = options;

    const state: EditorState = {
      lines: [""],
      row: 0,
      col: 0,
      output,
      prompt,
      linePrompt,
      promptWidth: stringWidth(prompt),
      linePromptWidth: stringWidth(linePrompt),
      statusText: "",
      statusColor: "",
      footerText: footer ?? "",
      rebuildFooter: null,
      history: historyEntries ? [...historyEntries] : [],
      historyIndex: historyEntries ? historyEntries.length : 0,
      draft: initialValue ?? "",
      undoStack: [],
      redoStack: [],
      lastEditType: "",
      validationActive: false,
      validateTimer: null,
      isPasting: false,
      escBuffer: "",
      escTimer: null,
      maxLines,
      maxLength,
      validate,
      validateDebounceMs,
      submitOnEnter,
      disabledKeys: new Set(disabledKeys),
      keyMap: {},
      buffering: false,
      writeBuffer: "",
    };

    // --- Resize handling ---

    let resizeHandler: (() => void) | null = null;
    const ttyOutput = output as NodeJS.WriteStream;
    if (typeof ttyOutput.on === "function" && "columns" in ttyOutput) {
      resizeHandler = () => {
        if (state.rebuildFooter) {
          state.footerText = state.rebuildFooter(ttyOutput.columns);
        }
        clearScreen(state);
      };
      ttyOutput.on("resize", resizeHandler);
    }

    function cleanup() {
      if (state.escTimer) {
        clearTimeout(state.escTimer);
        state.escTimer = null;
      }
      if (state.validateTimer) {
        clearTimeout(state.validateTimer);
        state.validateTimer = null;
      }
      if (resizeHandler && typeof ttyOutput.removeListener === "function") {
        ttyOutput.removeListener("resize", resizeHandler);
      }
      clearBelowEditor(state);
      w(state, "\x1b[?2004l"); // Disable bracketed paste mode
      w(state, "\x1b[<u"); // Disable kitty protocol
      input.setRawMode?.(false);
      input.removeListener("data", dataHandler);
      input.pause();
    }

    function submit() {
      if (validate) {
        const error = validate(state.lines.join("\n"));
        if (error) {
          state.validationActive = true;
          setStatus(state, error, "red");
          return;
        }
      }
      cleanup();
      w(state, "\n");
      resolve(state.lines.join("\n"));
    }

    function handleEOF() {
      const content = state.lines.join("\n");
      if (content.length === 0) {
        cleanup();
        w(state, "\n");
        reject(new EOFError());
      } else {
        handleDelete(state);
      }
    }

    function cancel() {
      cleanup();
      w(state, "\n");
      if (options.onCancel) {
        options.onCancel();
        resolve(state.lines.join("\n"));
      } else {
        reject(new CancelError());
      }
    }

    // Build key map
    buildKeyMap(state, submit, cancel, handleEOF);

    // --- Initialization ---

    if (prompt) w(state, prompt);

    if (initialValue) {
      const initLines = initialValue.split("\n");
      state.lines.length = 0;
      state.lines.push(...initLines);
      w(state, state.lines[0]);
      for (let i = 1; i < state.lines.length; i++) {
        w(state, "\n" + linePrompt + state.lines[i]);
      }
      state.row = state.lines.length - 1;
      state.col = state.lines[state.row].length;
    }

    if (footer) {
      const endRow = state.lines.length - 1;
      const dr = endRow - state.row;
      if (dr > 0) w(state, `\x1b[${dr}B`);
      const footerLines = footer.split("\n");
      for (const line of footerLines) {
        w(state, "\r\n" + line + "\x1b[K");
      }
      const upCount = endRow + footerLines.length - state.row;
      if (upCount > 0) w(state, `\x1b[${upCount}A`);
      w(state, `\x1b[${tCol(state, state.row, state.col)}G`);
    }

    input.setRawMode?.(true);
    input.resume();
    w(state, "\x1b[>1u"); // Enable kitty keyboard protocol
    w(state, "\x1b[?2004h"); // Enable bracketed paste mode

    // helpFooter: auto-generated key bindings help, shown after kitty detection
    // Must run after raw mode is enabled so the terminal can respond to the query
    if (helpFooter) {
      const helpOpts = typeof helpFooter === "object" ? helpFooter : {};
      const customFooter = footer ?? "";

      const buildFooterForColumns = (cols: number): string => {
        const helpText = buildHelpFooter({
          ...helpOpts,
          submitOnEnter,
          disabledKeys,
          columns: cols,
        });
        return customFooter ? customFooter + "\n" + helpText : helpText;
      };

      const ttyOut = output as NodeJS.WriteStream;
      detectKittyProtocol(input, output).then(() => {
        const columns = ("columns" in ttyOut && ttyOut.columns) || 80;
        state.rebuildFooter = buildFooterForColumns;
        setFooter(state, buildFooterForColumns(columns));
      });
    }

    function dataHandler(data: Buffer) {
      onData(state, data);
    }

    input.on("data", dataHandler);
  });
}
