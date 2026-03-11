import { styleText } from "node:util";
import { stringWidth } from "./chars.js";
import type { ModifiedEnterKey, TTYInput } from "./types.js";

type StyleTextFormat = Parameters<typeof styleText>[0];

interface HelpFooterOptions {
  /** Whether Enter submits the input (default: true) */
  submitOnEnter?: boolean;
  /** Key combinations that are disabled */
  disabledKeys?: ModifiedEnterKey[];
  /** Maximum number of key alternatives shown per action (default: 2) */
  maxKeysPerAction?: number;
  /** Maximum number of lines to display (default: unlimited) */
  maxLines?: number;
  /** Overall text style (default: "dim") */
  style?: StyleTextFormat;
  /** Style for key labels like "Enter", "Ctrl+Z" (default: none) */
  keyStyle?: StyleTextFormat;
  /** Terminal width for grid layout (default: process.stdout.columns ?? 80) */
  columns?: number;
}

interface HelpItem {
  keys: string[];
  action: string;
}

/** Preferred display order for newline/submit modified keys */
const MODIFIED_KEY_LABELS: Record<ModifiedEnterKey, string> = {
  "shift+enter": "Shift+Enter",
  "ctrl+j": "Ctrl+J",
  "ctrl+enter": "Ctrl+Enter",
  "alt+enter": "Alt+Enter",
  "cmd+enter": "Cmd+Enter",
};

const MODIFIED_KEY_ORDER: ModifiedEnterKey[] = [
  "shift+enter",
  "ctrl+j",
  "ctrl+enter",
  "alt+enter",
  "cmd+enter",
];

/** Keys that require the kitty keyboard protocol to work */
const KITTY_REQUIRED_KEYS: Set<ModifiedEnterKey> = new Set([
  "shift+enter",
  "ctrl+enter",
  "cmd+enter",
]);

// --- Kitty protocol detection ---

const DETECT_TIMEOUT_MS = 100;

let _kittySupported: boolean | undefined;
let _kittyDetectionPromise: Promise<boolean> | null = null;

/** @internal Reset detection cache for testing */
export function _resetKittyDetection(value?: boolean): void {
  _kittySupported = value;
  _kittyDetectionPromise = null;
}

/**
 * Detect kitty keyboard protocol support.
 * Must be called after raw mode is enabled on the input stream.
 * Results are cached; subsequent calls return the cached promise.
 */
export function detectKittyProtocol(
  input: TTYInput,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  if (_kittyDetectionPromise) return _kittyDetectionPromise;
  if (_kittySupported !== undefined) {
    _kittyDetectionPromise = Promise.resolve(_kittySupported);
    return _kittyDetectionPromise;
  }

  _kittyDetectionPromise = new Promise<boolean>((resolve) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        _kittySupported = false;
        resolve(false);
      }
    }, DETECT_TIMEOUT_MS);

    function onData(data: Buffer) {
      const str = data.toString();
      // Kitty protocol query response: \x1b[?{flags}u
      if (/\x1b\[\?\d*u/.test(str)) {
        if (!settled) {
          settled = true;
          cleanup();
          _kittySupported = true;
          resolve(true);
        }
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      input.removeListener("data", onData);
    }

    input.on("data", onData);
    // Query kitty keyboard protocol flags
    output.write("\x1b[?u");
  });

  return _kittyDetectionPromise;
}

// ---

function getAvailableModifiedKeys(disabledKeys: Set<ModifiedEnterKey>): ModifiedEnterKey[] {
  return MODIFIED_KEY_ORDER.filter((k) => {
    if (disabledKeys.has(k)) return false;
    if (_kittySupported === false && KITTY_REQUIRED_KEYS.has(k)) return false;
    return true;
  });
}

function buildItems(options: HelpFooterOptions): HelpItem[] {
  const { submitOnEnter = true, disabledKeys = [], maxKeysPerAction = 2 } = options;
  const disabled = new Set(disabledKeys);
  const items: HelpItem[] = [];

  const available = getAvailableModifiedKeys(disabled);
  const modifiedLabels = available
    .slice(0, Math.max(1, maxKeysPerAction))
    .map((k) => MODIFIED_KEY_LABELS[k]);

  if (submitOnEnter) {
    items.push({ keys: ["Enter"], action: "submit" });
    if (modifiedLabels.length > 0) items.push({ keys: modifiedLabels, action: "newline" });
  } else {
    if (modifiedLabels.length > 0) items.push({ keys: modifiedLabels, action: "submit" });
    items.push({ keys: ["Enter"], action: "newline" });
  }

  items.push({ keys: ["Ctrl+Z"], action: "undo" });
  items.push({ keys: ["Ctrl+C"], action: "cancel" });
  items.push({ keys: ["Ctrl+D"], action: "EOF" });

  return items;
}

function formatItem(item: HelpItem, keyStyle?: StyleTextFormat): string {
  const keys = item.keys.map((k) => (keyStyle ? styleText(keyStyle, k) : k)).join("/");
  return `${keys}: ${item.action}`;
}

function plainItemText(item: HelpItem): string {
  return `${item.keys.join("/")}: ${item.action}`;
}

function formatGrid(
  items: HelpItem[],
  keyStyle: StyleTextFormat | undefined,
  termWidth: number,
  maxLines?: number,
): string {
  const itemWidths = items.map((item) => stringWidth(plainItemText(item)));
  const maxItemWidth = Math.max(...itemWidths);

  const colWidth = maxItemWidth + 2;
  const numCols = Math.max(1, Math.floor(termWidth / colWidth));

  const rows: string[] = [];
  for (let i = 0; i < items.length; i += numCols) {
    if (maxLines !== undefined && rows.length >= maxLines) break;
    const rowItems = items.slice(i, i + numCols);
    const parts = rowItems.map((item, idx) => {
      const formatted = formatItem(item, keyStyle);
      if (idx < rowItems.length - 1) {
        const plain = plainItemText(item);
        const pad = colWidth - stringWidth(plain);
        return formatted + " ".repeat(Math.max(0, pad));
      }
      return formatted;
    });
    rows.push(parts.join(""));
  }

  return rows.join("\n");
}

/**
 * Build a help footer string with key binding descriptions.
 * Automatically adjusts grid layout based on terminal width.
 * Uses cached kitty protocol detection results to filter unavailable keys.
 */
export function buildHelpFooter(options: HelpFooterOptions = {}): string {
  const { style = "dim", keyStyle, columns, maxLines } = options;
  const termWidth = columns ?? (process.stdout.columns || 80);
  const items = buildItems(options);
  const text = formatGrid(items, keyStyle, termWidth, maxLines);
  return style ? styleText(style, text) : text;
}
