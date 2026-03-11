import type { styleText } from "node:util";

type StyleTextFormat = Parameters<typeof styleText>[0];

/** Error thrown when the user cancels input with Ctrl+C (when no onCancel callback is provided). */
export class CancelError extends Error {
  constructor() {
    super("Input cancelled");
    this.name = "CancelError";
  }
}

/** Error thrown when Ctrl+D is pressed on empty input. */
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

  /**
   * History entries (oldest first) or history options with file persistence.
   * - `string[]`: in-memory history entries
   * - `HistoryOptions`: file-based persistent history
   */
  history?: string[] | HistoryOptions;

  /**
   * How Up/Down arrow keys interact with history at boundaries (default: "single").
   * - "single": at boundary, one press triggers history navigation
   * - "double": at boundary, two consecutive presses trigger history navigation
   * - "disabled": Up/Down never triggers history (use dedicated keys instead)
   */
  historyArrowNavigation?: "single" | "double" | "disabled";

  /** Maximum number of lines allowed */
  maxLines?: number;

  /** Maximum total character count allowed */
  maxLength?: number;

  /** Validation function. Return an error message string to reject, or undefined/null to accept. */
  validate?: (value: string) => string | undefined | null;

  /** Debounce interval (ms) for live validation after first submit failure (default: 300) */
  validateDebounceMs?: number;

  /** Callback invoked when Ctrl+C is pressed. Called after cleanup. Default: rejects with CancelError. */
  onCancel?: () => void;

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

  /** Fixed footer text displayed below the editor. Appears below the status line. */
  footer?: string;

  /**
   * Auto-generated help footer showing key bindings.
   * Displayed below the custom footer (if any), after kitty protocol detection completes.
   * - true: show with default options
   * - object: customize display (maxKeysPerAction, maxLines, style, keyStyle)
   *
   * Terminal width (columns) is auto-calculated from the output stream.
   * submitOnEnter and disabledKeys are inherited from the parent options.
   */
  helpFooter?: boolean | HelpFooterDisplayOptions;
}

/** Built-in action names available for the help footer items configuration. */
export type HelpFooterAction =
  | "submit"
  | "newline"
  | "undo"
  | "redo"
  | "cancel"
  | "eof"
  | "history"
  | "word-jump"
  | "line-start"
  | "line-end"
  | "delete-word"
  | "delete-to-start"
  | "delete-to-end"
  | "clear-screen";

/** Display options for the auto-generated help footer showing key bindings. */
export interface HelpFooterDisplayOptions {
  /** Actions to display and their order (default: ["submit", "newline", "undo", "cancel", "eof"]) */
  items?: HelpFooterAction[];
  /** Maximum number of key alternatives shown per action (default: 2) */
  maxKeysPerAction?: number;
  /** Maximum number of lines to display (default: unlimited) */
  maxLines?: number;
  /** Overall text style applied via `node:util` styleText (default: "dim") */
  style?: StyleTextFormat;
  /** Style for key labels like "Enter", "Ctrl+Z" (default: none) */
  keyStyle?: StyleTextFormat;
}

/** Key combinations that can be used as modified Enter keys. These can be disabled via the disabledKeys option. */
export type ModifiedEnterKey = "shift+enter" | "ctrl+enter" | "cmd+enter" | "alt+enter" | "ctrl+j";

/** Options for file-based persistent history */
export interface HistoryOptions {
  /** File path for persistent storage (JSON format) */
  filePath: string;
  /** Maximum number of entries to keep (default: 100) */
  maxEntries?: number;
}

/** A readable stream with optional TTY capabilities for character-by-character raw mode input. */
export interface TTYInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): void;
}

export interface Snapshot {
  lines: string[];
  row: number;
  col: number;
}

export interface EditorState {
  // Buffer
  lines: string[];
  row: number;
  col: number;

  // Output
  output: NodeJS.WritableStream;

  // Prompt (readonly after init)
  prompt: string;
  linePrompt: string;
  promptWidth: number;
  linePromptWidth: number;

  // Status line
  statusText: string;
  statusColor: "red" | "green" | "";

  // Footer
  footerText: string;
  rebuildFooter: ((columns: number) => string) | null;

  // History
  history: string[];
  historyIndex: number;
  draft: string;
  historyArrowNavigation: "single" | "double" | "disabled";
  historyArrowAttempt: number;

  // Undo/redo
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  lastEditType: "insert" | "other" | "";

  // Validation
  validationActive: boolean;
  validateTimer: ReturnType<typeof setTimeout> | null;

  // Input processing
  isPasting: boolean;
  escBuffer: string;
  escTimer: ReturnType<typeof setTimeout> | null;

  // Options (readonly after init)
  maxLines: number | undefined;
  maxLength: number | undefined;
  validate: ((value: string) => string | undefined | null) | undefined;
  validateDebounceMs: number;
  submitOnEnter: boolean;
  disabledKeys: Set<ModifiedEnterKey>;

  // Key map (built once during init)
  keyMap: Record<string, () => void>;

  // Output buffering for flicker-free batch rendering
  buffering: boolean;
  writeBuffer: string;
}
