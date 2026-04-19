import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendHistory, appendPersistedHistory, loadHistory, saveHistory } from "./history.js";

const testDir = join(tmpdir(), "read-multiline-test-" + process.pid);
const testFile = join(testDir, "history.json");

function cleanup() {
  rmSync(testDir, { recursive: true, force: true });
}

describe("loadHistory", () => {
  afterEach(cleanup);

  it("returns [] when file does not exist", () => {
    expect(loadHistory("/nonexistent/path/history.json")).toEqual([]);
  });

  it("returns [] for invalid JSON", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, "not json");
    expect(loadHistory(testFile)).toEqual([]);
  });

  it("returns [] for non-array JSON", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify({ key: "value" }));
    expect(loadHistory(testFile)).toEqual([]);
  });

  it("filters out non-string entries", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["valid", 42, null, "also valid", true]));
    expect(loadHistory(testFile)).toEqual(["valid", "also valid"]);
  });

  it("loads valid string array", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["first", "second\nwith newline"]));
    expect(loadHistory(testFile)).toEqual(["first", "second\nwith newline"]);
  });

  it("applies maxEntries limit on load", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["a", "b", "c", "d", "e"]));
    expect(loadHistory(testFile, 3)).toEqual(["c", "d", "e"]);
  });

  it("returns all entries when under maxEntries", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["a", "b"]));
    expect(loadHistory(testFile, 5)).toEqual(["a", "b"]);
  });
});

describe("saveHistory", () => {
  afterEach(cleanup);

  it("creates parent directory and writes JSON", () => {
    saveHistory(testFile, ["entry1", "entry2"]);
    const data = JSON.parse(readFileSync(testFile, "utf8"));
    expect(data).toEqual(["entry1", "entry2"]);
  });

  it("leaves no tmp files behind after a successful write", () => {
    saveHistory(testFile, ["x"]);
    const stale = readdirSync(dirname(testFile)).filter((f) => f.endsWith(".tmp"));
    expect(stale).toEqual([]);
  });

  it("replaces the previous contents atomically", () => {
    saveHistory(testFile, ["old"]);
    saveHistory(testFile, ["new1", "new2"]);
    expect(loadHistory(testFile)).toEqual(["new1", "new2"]);
  });
});

describe("appendPersistedHistory", () => {
  afterEach(cleanup);

  it("creates the file with the first entry", () => {
    appendPersistedHistory(testFile, "first");
    expect(loadHistory(testFile)).toEqual(["first"]);
  });

  it("appends to an existing file", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["a", "b"]));
    appendPersistedHistory(testFile, "c");
    expect(loadHistory(testFile)).toEqual(["a", "b", "c"]);
  });

  it("re-reads the file before appending so concurrently-written entries are preserved", () => {
    // Simulate two sessions: session A loaded ["a"] into memory,
    // then session B appended "b" to the file on disk.
    // When session A appends "c", it must reload "b" from disk first.
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["a", "b"]));
    appendPersistedHistory(testFile, "c");
    expect(loadHistory(testFile)).toEqual(["a", "b", "c"]);
  });

  it("applies maxEntries cap during append", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, JSON.stringify(["a", "b", "c"]));
    appendPersistedHistory(testFile, "d", 3);
    expect(loadHistory(testFile)).toEqual(["b", "c", "d"]);
  });

  it("keeps the file a valid JSON document after each append", () => {
    for (let i = 0; i < 10; i++) {
      appendPersistedHistory(testFile, `entry-${i}`);
      const entries = loadHistory(testFile);
      expect(entries).toEqual(Array.from({ length: i + 1 }, (_unused, index) => `entry-${index}`));
    }
  });
});

describe("appendHistory", () => {
  it("appends entry to the array", () => {
    expect(appendHistory(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("trims oldest entries when exceeding maxEntries", () => {
    expect(appendHistory(["a", "b", "c"], "d", 3)).toEqual(["b", "c", "d"]);
  });

  it("does not trim when under maxEntries", () => {
    expect(appendHistory(["a"], "b", 5)).toEqual(["a", "b"]);
  });

  it("does not trim when maxEntries is undefined", () => {
    expect(appendHistory(["a", "b", "c"], "d")).toEqual(["a", "b", "c", "d"]);
  });

  it("handles maxEntries of 1", () => {
    expect(appendHistory(["a", "b"], "c", 1)).toEqual(["c"]);
  });
});
