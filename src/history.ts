import { mkdirSync, readFileSync, writeFile } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

/** Expand leading ~ to the user's home directory */
function expandHome(filePath: string): string {
  if (filePath === "~" || filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return filePath.replace("~", homedir());
  }
  return filePath;
}

/** Load history entries from a JSON file. Returns [] if file doesn't exist or is invalid. */
export function loadHistory(filePath: string, maxEntries?: number): string[] {
  try {
    const data = readFileSync(expandHome(filePath), "utf8");
    const parsed = JSON.parse(data);
    const entries = Array.isArray(parsed)
      ? parsed.filter((e): e is string => typeof e === "string")
      : [];
    if (maxEntries != null && maxEntries > 0 && entries.length > maxEntries) {
      return entries.slice(-maxEntries);
    }
    return entries;
  } catch {
    return [];
  }
}

/** Save history entries to a JSON file asynchronously. Errors are silently ignored. */
export async function saveHistory(filePath: string, entries: string[]): Promise<void> {
  const resolved = expandHome(filePath);
  try {
    mkdirSync(dirname(resolved), { recursive: true });
  } catch {
    // ignore
  }
  await new Promise<void>((resolve) => {
    writeFile(resolved, JSON.stringify(entries), () => resolve());
  });
}

/** Append an entry to the history array and apply maxEntries limit. Returns a new array. */
export function appendHistory(entries: string[], entry: string, maxEntries?: number): string[] {
  const updated = [...entries, entry];
  if (maxEntries != null && maxEntries > 0 && updated.length > maxEntries) {
    return updated.slice(-maxEntries);
  }
  return updated;
}
