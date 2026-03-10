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
}

/** Key combinations that can be used as modified Enter keys. These can be disabled via the disabledKeys option. */
export type ModifiedEnterKey = "shift+enter" | "ctrl+enter" | "cmd+enter" | "alt+enter" | "ctrl+j";

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

  // History
  history: string[];
  historyIndex: number;
  draft: string;

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
}
