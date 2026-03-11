import { mkdirSync, readFileSync, writeFile } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

/** Expand leading ~ to the user's home directory */
function expandHome(filePath: string): string {
  if (filePath.startsWith("~/") || filePath === "~") {
    return filePath.replace("~", homedir());
  }
  return filePath;
}

/** Load history entries from a JSON file. Returns [] if file doesn't exist or is invalid. */
export function loadHistory(filePath: string): string[] {
  try {
    const data = readFileSync(expandHome(filePath), "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** Save history entries to a JSON file asynchronously. Errors are silently ignored. */
export function saveHistory(filePath: string, entries: string[]): void {
  const resolved = expandHome(filePath);
  try {
    mkdirSync(dirname(resolved), { recursive: true });
  } catch {
    // ignore
  }
  writeFile(resolved, JSON.stringify(entries), () => {});
}

/** Append an entry to the history array and apply maxEntries limit. Returns a new array. */
export function appendHistory(entries: string[], entry: string, maxEntries?: number): string[] {
  const updated = [...entries, entry];
  if (maxEntries != null && maxEntries > 0 && updated.length > maxEntries) {
    return updated.slice(-maxEntries);
  }
  return updated;
}
