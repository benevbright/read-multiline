import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendHistory, loadHistory, saveHistory } from "./history.js";

const testDir = join(tmpdir(), "read-multiline-test-" + process.pid);
const testFile = join(testDir, "history.json");

function cleanup() {
  try {
    unlinkSync(testFile);
  } catch {
    // ignore
  }
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

  it("creates parent directory and writes JSON", async () => {
    await saveHistory(testFile, ["entry1", "entry2"]);
    const data = JSON.parse(readFileSync(testFile, "utf8"));
    expect(data).toEqual(["entry1", "entry2"]);
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
