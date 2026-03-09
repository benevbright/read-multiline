import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  readMultiline,
  CancelError,
  EOFError,
  type TTYInput,
} from "./index.js";

// Dummy output stream that records writes
function createNullOutput() {
  const chunks: string[] = [];
  const stream = {
    write(data: string) {
      chunks.push(data);
      return true;
    },
  } as NodeJS.WritableStream;
  return { stream, chunks };
}

// Helper to simulate TTY input
function createTTYInput(): TTYInput &
  EventEmitter & { send: (data: string) => void } {
  const emitter = new EventEmitter() as TTYInput &
    EventEmitter & { send: (data: string) => void };
  emitter.isTTY = true;
  emitter.setRawMode = vi.fn();
  emitter.resume = vi.fn();
  emitter.pause = vi.fn();
  emitter.read = vi.fn();

  emitter.send = (data: string) => {
    emitter.emit("data", Buffer.from(data));
  };

  return emitter;
}

// Key sequence constants
const KEY = {
  ENTER: "\r",
  KITTY_ENTER: "\x1b[13u",
  SHIFT_ENTER: "\x1b[13;2u",
  BACKSPACE: "\x7f",
  DELETE: "\x1b[3~",
  CTRL_C: "\x03",
  CTRL_D: "\x04",
  CTRL_W: "\x17",
  CTRL_U: "\x15",
  CTRL_K: "\x0b",
  CTRL_L: "\x0c",
  UP: "\x1b[A",
  DOWN: "\x1b[B",
  RIGHT: "\x1b[C",
  LEFT: "\x1b[D",
  ALT_RIGHT: "\x1b[1;3C",
  ALT_LEFT: "\x1b[1;3D",
  ALT_UP: "\x1b[1;3A",
  ALT_DOWN: "\x1b[1;3B",
  CTRL_RIGHT: "\x1b[1;5C",
  CTRL_LEFT: "\x1b[1;5D",
  ESC_B: "\x1bb",
  ESC_F: "\x1bf",
  CMD_LEFT: "\x1b[1;9D",
  CMD_RIGHT: "\x1b[1;9C",
  CMD_UP: "\x1b[1;9A",
  CMD_DOWN: "\x1b[1;9B",
  HOME: "\x1b[H",
  END: "\x1b[F",
};

describe("readMultiline (TTY mode)", () => {
  let input: ReturnType<typeof createTTYInput>;
  let output: ReturnType<typeof createNullOutput>;

  beforeEach(() => {
    input = createTTYInput();
    output = createNullOutput();
  });

  // --- Basic operations ---

  it("submits input on Enter", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello");
  });

  it("inserts newline on Shift+Enter and submits on Enter", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send("line2");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2");
  });

  it("handles multiple Shift+Enter for multi-line input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("a");
    input.send(KEY.SHIFT_ENTER);
    input.send("b");
    input.send(KEY.SHIFT_ENTER);
    input.send("c");
    input.send(KEY.ENTER);
    expect(await promise).toBe("a\nb\nc");
  });

  it("throws CancelError on Ctrl+C", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("partial");
    input.send(KEY.CTRL_C);
    await expect(promise).rejects.toThrow(CancelError);
  });

  it("throws CancelError on Ctrl+C with no input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send(KEY.CTRL_C);
    await expect(promise).rejects.toThrow(CancelError);
  });

  it("submits on Ctrl+D when input exists", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("text");
    input.send(KEY.CTRL_D);
    expect(await promise).toBe("text");
  });

  it("throws EOFError on Ctrl+D when input is empty", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send(KEY.CTRL_D);
    await expect(promise).rejects.toThrow(EOFError);
  });

  it("returns empty string on Enter with no input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send(KEY.ENTER);
    expect(await promise).toBe("");
  });

  it("submits on kitty protocol Enter (CSI 13u)", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("test");
    input.send(KEY.KITTY_ENTER);
    expect(await promise).toBe("test");
  });

  // --- Backspace ---

  it("deletes the last character on Backspace", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.BACKSPACE);
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab");
  });

  it("merges lines on Backspace at line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send(KEY.BACKSPACE);
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1");
  });

  // --- Ctrl+W (word deletion) ---

  it("deletes the previous word on Ctrl+W", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send(KEY.CTRL_W);
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello ");
  });

  it("deletes trailing whitespace and word on Ctrl+W", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello  world  ");
    input.send(KEY.CTRL_W);
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello  ");
  });

  it("deletes the entire line if it is a single word on Ctrl+W", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.CTRL_W);
    input.send(KEY.ENTER);
    expect(await promise).toBe("");
  });

  it("merges with previous line on Ctrl+W at line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.SHIFT_ENTER);
    input.send(KEY.CTRL_W);
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  it("deletes word from cursor mid-position on Ctrl+W", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("foo bar baz");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // foo bar |baz
    input.send(KEY.CTRL_W); // delete " bar" -> "foo |baz"
    input.send(KEY.ENTER);
    expect(await promise).toBe("foo baz");
  });

  it("deletes full-width word on Ctrl+W", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello \u3042\u3044\u3046");
    input.send(KEY.CTRL_W);
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello ");
  });

  // --- Backspace (additional) ---

  it("deletes character at cursor mid-position on Backspace", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.LEFT); // ab|c
    input.send(KEY.BACKSPACE); // a|c
    input.send(KEY.ENTER);
    expect(await promise).toBe("ac");
  });

  // --- Shift+Enter line splitting ---

  it("splits line at cursor position on Shift+Enter", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abcd");
    input.send(KEY.LEFT); // abc|d
    input.send(KEY.LEFT); // ab|cd
    input.send(KEY.SHIFT_ENTER);
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab\ncd");
  });

  // --- Arrow key movement ---

  it("moves left and inserts character", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ac");
    input.send(KEY.LEFT); // a|c
    input.send("b");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  it("moves right after moving left", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // a|bc
    input.send(KEY.RIGHT); // ab|c
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abXc");
  });

  it("crosses to previous line end on Left at line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cd");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // line 2 start
    input.send(KEY.LEFT); // line 1 end (ab|)
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abX\ncd");
  });

  it("crosses to next line start on Right at line end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cd");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // line 1 end
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // line 1 start (|ab)
    input.send(KEY.RIGHT);
    input.send(KEY.RIGHT); // line 1 end (ab|)
    input.send(KEY.RIGHT); // line 2 start (|cd)
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab\nXcd");
  });

  it("moves up to previous line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.SHIFT_ENTER);
    input.send("de");
    input.send(KEY.UP); // line 1, col=min(2, 3)=2 -> ab|c
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abXc\nde");
  });

  it("moves down to next line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.SHIFT_ENTER);
    input.send("de");
    input.send(KEY.UP);
    input.send(KEY.DOWN); // line 2, col=min(2, 2)=2 -> de|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc\ndeX");
  });

  it("clamps column to line end when moving up to a shorter line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cdefg");
    input.send(KEY.UP); // line 1, col=min(5, 2)=2 -> ab|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abX\ncdefg");
  });

  // --- Alt+Arrow (word jump) ---

  it("jumps to word end on Alt+Right", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    for (let i = 0; i < 11; i++) input.send(KEY.LEFT);
    input.send(KEY.ALT_RIGHT); // hello|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("helloX world");
  });

  it("jumps to word start on Alt+Left", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send(KEY.ALT_LEFT); // |world
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello Xworld");
  });

  it("crosses to next line on Alt+Right at line end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cd");
    input.send(KEY.UP);
    input.send(KEY.CMD_RIGHT); // line end
    input.send(KEY.ALT_RIGHT); // next line word end
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab\ncdX");
  });

  it("crosses to previous line on Alt+Left at line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cd");
    input.send(KEY.CMD_LEFT); // line 2 start
    input.send(KEY.ALT_LEFT); // previous line
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("Xab\ncd");
  });

  // --- Ctrl+Arrow (word jump) ---

  it("jumps to word end on Ctrl+Right", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    for (let i = 0; i < 11; i++) input.send(KEY.LEFT);
    input.send(KEY.CTRL_RIGHT); // hello|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("helloX world");
  });

  it("jumps to word start on Ctrl+Left", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send(KEY.CTRL_LEFT); // |world
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello Xworld");
  });

  // --- ESC+b/f (macOS Option+Arrow fallback) ---

  it("jumps to word start on ESC+b", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send(KEY.ESC_B); // |world
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello Xworld");
  });

  it("jumps to word end on ESC+f", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    for (let i = 0; i < 11; i++) input.send(KEY.LEFT);
    input.send(KEY.ESC_F); // hello|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("helloX world");
  });

  // --- Cmd+Arrow (line start/end, buffer start/end) ---

  it("moves to line start on Cmd+Left", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.CMD_LEFT); // |hello
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("Xhello");
  });

  it("moves to line end on Cmd+Right", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // hel|lo
    input.send(KEY.CMD_RIGHT); // hello|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("helloX");
  });

  it("moves to buffer start on Cmd+Up", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send("line2");
    input.send(KEY.CMD_UP); // |line1
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("Xline1\nline2");
  });

  it("moves to buffer end on Cmd+Down", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send("line2");
    input.send(KEY.CMD_UP);
    input.send(KEY.CMD_DOWN); // line2|
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2X");
  });

  it("Home/End keys work as line start/end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.HOME); // |hello
    input.send("A");
    input.send(KEY.END); // Ahello|
    input.send("Z");
    input.send(KEY.ENTER);
    expect(await promise).toBe("AhelloZ");
  });

  // --- Protocol / Settings ---

  it("enables and disables raw mode", async () => {
    const promise = readMultiline({ input, output: output.stream });
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    input.send(KEY.ENTER);
    await promise;
    expect(input.setRawMode).toHaveBeenCalledWith(false);
  });

  it("enables and disables kitty keyboard protocol", async () => {
    const promise = readMultiline({ input, output: output.stream });
    expect(output.chunks).toContain("\x1b[>1u");
    input.send(KEY.ENTER);
    await promise;
    expect(output.chunks).toContain("\x1b[<u");
  });

  it("displays the prompt", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      prompt: "> ",
    });
    expect(output.chunks[0]).toBe("> ");
    input.send(KEY.ENTER);
    await promise;
  });

  it("displays linePrompt on continuation lines", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      prompt: "> ",
      linePrompt: "... ",
    });
    input.send("a");
    input.send(KEY.SHIFT_ENTER);
    expect(output.chunks.join("")).toContain("\n... ");
    input.send(KEY.ENTER);
    await promise;
  });

  it("ignores unknown escape sequences", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send("\x1b[99~");
    input.send("c");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  // --- Full-width characters ---

  it("handles full-width character input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3044\u3046");
    input.send(KEY.ENTER);
    expect(await promise).toBe("\u3042\u3044\u3046");
  });

  it("inserts at cursor position between full-width characters", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3046");
    input.send(KEY.LEFT); // \u3042|\u3046
    input.send("\u3044");
    input.send(KEY.ENTER);
    expect(await promise).toBe("\u3042\u3044\u3046");
  });

  it("deletes full-width character on Backspace", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3044\u3046");
    input.send(KEY.BACKSPACE);
    input.send(KEY.ENTER);
    expect(await promise).toBe("\u3042\u3044");
  });

  it("deletes full-width character at cursor mid-position on Backspace", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3044\u3046");
    input.send(KEY.LEFT); // \u3042\u3044|\u3046
    input.send(KEY.BACKSPACE);
    input.send(KEY.ENTER);
    expect(await promise).toBe("\u3042\u3046");
  });

  it("moves correctly with Left/Right on full-width characters", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3044\u3046");
    input.send(KEY.LEFT); // \u3042\u3044|\u3046
    input.send(KEY.LEFT); // \u3042|\u3044\u3046
    input.send(KEY.RIGHT); // \u3042\u3044|\u3046
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("\u3042\u3044X\u3046");
  });

  it("handles mixed half-width and full-width characters", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("a\u3042b");
    input.send(KEY.LEFT); // a\u3042|b
    input.send(KEY.LEFT); // a|\u3042b
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("aX\u3042b");
  });

  // --- Paste ---

  it("handles multi-line paste", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\x1b[200~line1\nline2\nline3\x1b[201~");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2\nline3");
  });

  it("normalizes \\r\\n line endings in paste", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\x1b[200~line1\r\nline2\r\nline3\x1b[201~");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2\nline3");
  });

  it("pastes into existing input at cursor position", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("before");
    input.send("\x1b[200~pasted1\npasted2\x1b[201~");
    input.send("after");
    input.send(KEY.ENTER);
    expect(await promise).toBe("beforepasted1\npasted2after");
  });

  it("treats \\r in paste as newline, not submit", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\x1b[200~a\rb\x1b[201~");
    input.send(KEY.ENTER);
    expect(await promise).toBe("a\nb");
  });

  it("handles paste data split across multiple events", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\x1b[200~hello\n");
    input.send("world\x1b[201~");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello\nworld");
  });

  it("continues key operations after paste", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\x1b[200~abc\x1b[201~");
    input.send(KEY.BACKSPACE);
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab");
  });

  // --- Full-width characters (additional) ---

  it("Cmd+Left/Right works with full-width characters", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3044\u3046");
    input.send(KEY.CMD_LEFT); // |\u3042\u3044\u3046
    input.send("X");
    input.send(KEY.CMD_RIGHT); // X\u3042\u3044\u3046|
    input.send("Y");
    input.send(KEY.ENTER);
    expect(await promise).toBe("X\u3042\u3044\u3046Y");
  });

  // --- ANSI output correctness ---

  it("writes correct ANSI cursor position for full-width characters", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      prompt: "> ",
    });
    input.send("\u3042"); // 2-column wide char
    input.send(KEY.LEFT); // should move back 2 columns
    const joined = output.chunks.join("");
    // Left on a full-width char emits ESC[2D (move left 2 columns)
    expect(joined).toContain("\x1b[2D");
    input.send(KEY.ENTER);
    await promise;
  });

  it("writes correct ANSI cursor column with prompt offset on moveTo", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      prompt: ">>> ",
    });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cd");
    input.send(KEY.UP); // moveTo(0, min(2,2)) -> column = 4 + width("ab") + 1 = 7
    const joined = output.chunks.join("");
    expect(joined).toContain("\x1b[7G");
    input.send(KEY.ENTER);
    await promise;
  });

  // --- ESC buffering ---

  it("combines split ESC sequence via buffering", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    // Simulate ESC arriving separately from the rest of the sequence (ESC+b = wordLeft)
    input.send("\x1b");
    // After a short delay, send the rest
    await new Promise((r) => setTimeout(r, 10));
    input.send("b"); // should combine to \x1bb = wordLeft -> |world
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello Xworld");
  });

  it("flushes standalone ESC after timeout", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send("\x1b");
    // Wait longer than ESC_TIMEOUT (50ms)
    await new Promise((r) => setTimeout(r, 80));
    // ESC alone should be flushed and discarded (no keyMap match)
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcX");
  });

  // --- Kitty protocol key variants ---

  it("handles kitty Ctrl+C (CSI 99;5u)", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("text");
    input.send("\x1b[99;5u");
    await expect(promise).rejects.toThrow(CancelError);
  });

  it("handles kitty Ctrl+D (CSI 100;5u) with input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("text");
    input.send("\x1b[100;5u");
    expect(await promise).toBe("text");
  });

  it("handles kitty Ctrl+D (CSI 100;5u) on empty input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\x1b[100;5u");
    await expect(promise).rejects.toThrow(EOFError);
  });

  it("handles kitty Ctrl+W (CSI 119;5u)", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send("\x1b[119;5u");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello ");
  });

  it("handles kitty Ctrl+A (CSI 97;5u) as line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send("\x1b[97;5u"); // line start
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("Xhello");
  });

  it("handles kitty Ctrl+E (CSI 101;5u) as line end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send("\x1b[101;5u"); // line end
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("helloX");
  });

  // --- Edge cases: boundary no-ops ---

  it("does nothing on Backspace at start of first line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send(KEY.BACKSPACE);
    input.send("abc");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  it("does nothing on Up at first line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.UP);
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcX");
  });

  it("does nothing on Down at last line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.DOWN);
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcX");
  });

  it("does nothing on Left at start of first line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.CMD_LEFT);
    input.send(KEY.LEFT); // already at absolute start
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("Xabc");
  });

  it("does nothing on Right at end of last line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.RIGHT); // already at end
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcX");
  });

  it("does nothing on Cmd+Left when already at line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.CMD_LEFT);
    input.send(KEY.CMD_LEFT); // already at start
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("Xabc");
  });

  it("does nothing on Cmd+Right when already at line end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.CMD_RIGHT); // already at end
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcX");
  });

  it("Ctrl+W on empty line does nothing", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send(KEY.CTRL_W);
    input.send("abc");
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  // --- Surrogate pair characters (emoji) ---

  it("handles surrogate pair character input", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("a\u{1F600}b"); // 😀
    input.send(KEY.ENTER);
    expect(await promise).toBe("a\u{1F600}b");
  });

  it("deletes surrogate pair character on Backspace", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("a\u{1F600}b");
    input.send(KEY.BACKSPACE); // delete b
    input.send(KEY.BACKSPACE); // delete 😀
    input.send(KEY.ENTER);
    expect(await promise).toBe("a");
  });

  it("moves cursor correctly around surrogate pair characters", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("a\u{1F600}b");
    input.send(KEY.LEFT); // a😀|b
    input.send(KEY.LEFT); // a|😀b
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("aX\u{1F600}b");
  });

  // --- Cleanup ---

  it("enables and disables bracketed paste mode", async () => {
    const promise = readMultiline({ input, output: output.stream });
    expect(output.chunks).toContain("\x1b[?2004h");
    input.send(KEY.ENTER);
    await promise;
    expect(output.chunks).toContain("\x1b[?2004l");
  });

  it("clears escTimer on cleanup", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send("\x1b"); // start ESC buffering with timer
    // Wait for the ESC timer to flush (50ms), then cancel normally
    await new Promise((r) => setTimeout(r, 80));
    input.send(KEY.CTRL_C);
    await expect(promise).rejects.toThrow(CancelError);
    // If escTimer wasn't properly handled, the timer would fire after cleanup
    // and potentially cause errors. This test verifies cleanup completes cleanly.
  });

  // --- linePrompt default ---

  it("uses prompt as default linePrompt when linePrompt is not specified", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      prompt: ">> ",
    });
    input.send("a");
    input.send(KEY.SHIFT_ENTER);
    const joined = output.chunks.join("");
    expect(joined).toContain("\n>> ");
    input.send(KEY.ENTER);
    await promise;
  });

  // --- Delete key (forward delete) ---

  it("deletes the character ahead on Delete", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.LEFT); // ab|c
    input.send(KEY.DELETE); // ab|
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab");
  });

  it("merges next line on Delete at line end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER);
    input.send("cd");
    input.send(KEY.UP);
    input.send(KEY.CMD_RIGHT); // end of line 1: ab|
    input.send(KEY.DELETE); // merge: abcd|
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcd");
  });

  it("does nothing on Delete at end of last line", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.DELETE);
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  it("deletes full-width character on Delete", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("\u3042\u3044\u3046");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // あ|いう
    input.send(KEY.DELETE); // あ|う
    input.send(KEY.ENTER);
    expect(await promise).toBe("\u3042\u3046");
  });

  // --- Ctrl+U (delete to line start) ---

  it("deletes from cursor to line start on Ctrl+U", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // hello |world
    input.send(KEY.CTRL_U); // |world
    input.send(KEY.ENTER);
    expect(await promise).toBe("world");
  });

  it("does nothing on Ctrl+U at line start", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.CMD_LEFT);
    input.send(KEY.CTRL_U);
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  // --- Ctrl+K (delete to line end) ---

  it("deletes from cursor to line end on Ctrl+K", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello world");
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT);
    input.send(KEY.LEFT); // hello |world
    input.send(KEY.CTRL_K); // hello |
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello ");
  });

  it("does nothing on Ctrl+K at line end", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("abc");
    input.send(KEY.CTRL_K);
    input.send(KEY.ENTER);
    expect(await promise).toBe("abc");
  });

  // --- initialValue ---

  it("pre-populates input with initialValue", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      initialValue: "hello",
    });
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello");
  });

  it("pre-populates multi-line initialValue", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      initialValue: "line1\nline2\nline3",
    });
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2\nline3");
  });

  it("allows editing after initialValue", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      initialValue: "hello",
    });
    input.send(" world");
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello world");
  });

  // --- History ---

  it("navigates to previous history on Up at first line", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["first", "second"],
    });
    input.send(KEY.UP); // -> "second"
    input.send(KEY.ENTER);
    expect(await promise).toBe("second");
  });

  it("navigates through history entries", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["first", "second"],
    });
    input.send(KEY.UP); // -> "second"
    input.send(KEY.UP); // -> "first"
    input.send(KEY.ENTER);
    expect(await promise).toBe("first");
  });

  it("returns to draft on Down past end of history", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["first", "second"],
    });
    input.send("draft");
    input.send(KEY.UP); // -> "second"
    input.send(KEY.DOWN); // -> "draft"
    input.send(KEY.ENTER);
    expect(await promise).toBe("draft");
  });

  it("does not go past beginning of history", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["only"],
    });
    input.send(KEY.UP); // -> "only"
    input.send(KEY.UP); // no-op (already at oldest)
    input.send(KEY.ENTER);
    expect(await promise).toBe("only");
  });

  it("Up on non-first line moves cursor, not history", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["old"],
    });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send("line2");
    input.send(KEY.UP); // move to line 1 (col clamped to min(5,5)=5 = end)
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1X\nline2");
  });

  it("Down on non-last line moves cursor, not history", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["old"],
    });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send("line2");
    input.send(KEY.UP); // move to line 1
    input.send(KEY.DOWN); // move to line 2 (col clamped to min(5,5)=5 = end)
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2X");
  });

  it("Alt+Up/Down always moves cursor, never triggers history", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["old"],
    });
    input.send("only line");
    input.send(KEY.ALT_UP); // pure move up (no-op on first line)
    input.send("X");
    input.send(KEY.ENTER);
    expect(await promise).toBe("only lineX");
  });

  it("navigates multi-line history entries", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      history: ["line1\nline2"],
    });
    input.send(KEY.UP); // -> "line1\nline2"
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2");
  });

  // --- Validation ---

  it("rejects submit when validation fails", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      validate: (v) => (v.length < 3 ? "Too short" : undefined),
    });
    input.send("ab");
    input.send(KEY.ENTER); // validation fails, does not submit
    input.send("c"); // now "abc"
    input.send(KEY.ENTER); // validation passes
    expect(await promise).toBe("abc");
  });

  it("submits when validation returns undefined", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      validate: () => undefined,
    });
    input.send("anything");
    input.send(KEY.ENTER);
    expect(await promise).toBe("anything");
  });

  it("submits when validation returns null", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      validate: () => null,
    });
    input.send("anything");
    input.send(KEY.ENTER);
    expect(await promise).toBe("anything");
  });

  // --- Max lines ---

  it("prevents newline insertion when at maxLines", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      maxLines: 2,
    });
    input.send("line1");
    input.send(KEY.SHIFT_ENTER);
    input.send("line2");
    input.send(KEY.SHIFT_ENTER); // blocked
    input.send("line3");
    input.send(KEY.ENTER);
    expect(await promise).toBe("line1\nline2line3");
  });

  // --- Max length ---

  it("prevents character insertion when at maxLength", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      maxLength: 5,
    });
    input.send("abcde");
    input.send("f"); // blocked
    input.send(KEY.ENTER);
    expect(await promise).toBe("abcde");
  });

  it("counts newlines in maxLength", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      maxLength: 5,
    });
    input.send("ab");
    input.send(KEY.SHIFT_ENTER); // "ab\n" = 3 chars
    input.send("cd"); // "ab\ncd" = 5 chars
    input.send("e"); // blocked
    input.send(KEY.ENTER);
    expect(await promise).toBe("ab\ncd");
  });

  it("allows deletion when at maxLength", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      maxLength: 3,
    });
    input.send("abc"); // at limit
    input.send(KEY.BACKSPACE); // "ab"
    input.send("d"); // "abd" (back at limit)
    input.send(KEY.ENTER);
    expect(await promise).toBe("abd");
  });

  // --- Ctrl+L ---

  it("Ctrl+L preserves input content", async () => {
    const promise = readMultiline({ input, output: output.stream });
    input.send("hello");
    input.send(KEY.CTRL_L);
    input.send(KEY.ENTER);
    expect(await promise).toBe("hello");
  });

  // --- submitOnEnter option ---

  it("submitOnEnter=false: Enter inserts newline, modified Enter submits", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
    });
    input.send("line1");
    input.send(KEY.ENTER); // inserts newline
    input.send("line2");
    input.send(KEY.SHIFT_ENTER); // submits (any modified enter works)
    expect(await promise).toBe("line1\nline2");
  });

  it("submitOnEnter=false: Ctrl+J submits", async () => {
    const CTRL_J = "\n";
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
    });
    input.send("hello");
    input.send(CTRL_J); // submits
    expect(await promise).toBe("hello");
  });

  it("submitOnEnter=false: Cmd+Enter submits", async () => {
    const CMD_ENTER = "\x1b[13;9u";
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
    });
    input.send("line1");
    input.send(KEY.ENTER); // inserts newline
    input.send("line2");
    input.send(CMD_ENTER); // submits
    expect(await promise).toBe("line1\nline2");
  });

  it("submitOnEnter=false: Ctrl+Enter (kitty) submits", async () => {
    const CTRL_ENTER = "\x1b[13;5u";
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
    });
    input.send("text");
    input.send(CTRL_ENTER); // submits
    expect(await promise).toBe("text");
  });

  it("submitOnEnter=false: Alt+Enter (legacy ESC+CR) submits", async () => {
    const ALT_ENTER_LEGACY = "\x1b\r";
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
    });
    input.send("text");
    input.send(ALT_ENTER_LEGACY); // submits
    expect(await promise).toBe("text");
  });

  it("submitOnEnter=true (default): all modified enters insert newline", async () => {
    const CTRL_J = "\n";
    const promise = readMultiline({
      input,
      output: output.stream,
    });
    input.send("a");
    input.send(KEY.SHIFT_ENTER); // newline
    input.send("b");
    input.send(CTRL_J); // newline (Ctrl+J)
    input.send("c");
    input.send(KEY.ENTER); // submits
    expect(await promise).toBe("a\nb\nc");
  });

  it("submitOnEnter=false: plain Enter does not submit", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
    });
    input.send("a");
    input.send(KEY.ENTER); // newline
    input.send("b");
    input.send(KEY.ENTER); // newline
    input.send("c");
    input.send(KEY.SHIFT_ENTER); // submits
    expect(await promise).toBe("a\nb\nc");
  });

  it("submitOnEnter=false: validation runs on modified enter submit", async () => {
    const CMD_ENTER = "\x1b[13;9u";
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
      validate: (v) => (v.length < 3 ? "Too short" : undefined),
    });
    input.send("ab");
    input.send(CMD_ENTER); // validation fails, does not submit
    input.send("c"); // now "abc"
    input.send(CMD_ENTER); // validation passes
    expect(await promise).toBe("abc");
  });

  it("submitOnEnter=false with maxLines: Enter respects maxLines", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
      maxLines: 2,
    });
    input.send("line1");
    input.send(KEY.ENTER); // newline (line 2)
    input.send("line2");
    input.send(KEY.ENTER); // blocked by maxLines
    input.send("extra");
    input.send(KEY.SHIFT_ENTER); // submit
    expect(await promise).toBe("line1\nline2extra");
  });

  // --- disabledKeys option ---

  it("disabledKeys disables specific key combos", async () => {
    const CTRL_J = "\n";
    const promise = readMultiline({
      input,
      output: output.stream,
      disabledKeys: ["ctrl+j"],
    });
    input.send("hello");
    input.send(CTRL_J); // disabled, ignored
    input.send(KEY.SHIFT_ENTER); // newline still works
    input.send("world");
    input.send(KEY.ENTER); // submits
    expect(await promise).toBe("hello\nworld");
  });

  it("disabledKeys works with submitOnEnter=false", async () => {
    const promise = readMultiline({
      input,
      output: output.stream,
      submitOnEnter: false,
      disabledKeys: ["shift+enter", "alt+enter"],
    });
    input.send("text");
    input.send(KEY.SHIFT_ENTER); // disabled, ignored
    // Ctrl+J still works as submit
    input.send("\n");
    expect(await promise).toBe("text");
  });
});

describe("readMultiline (pipe mode)", () => {
  it("reads all lines until EOF from pipe input", async () => {
    const input = Readable.from(["line1\nline2\nline3\n"]) as TTYInput;
    input.isTTY = false;
    const { stream } = createNullOutput();
    expect(await readMultiline({ input, output: stream })).toBe(
      "line1\nline2\nline3",
    );
  });

  it("returns input without trailing newline from pipe", async () => {
    const input = Readable.from(["hello\nworld"]) as TTYInput;
    input.isTTY = false;
    const { stream } = createNullOutput();
    expect(await readMultiline({ input, output: stream })).toBe("hello\nworld");
  });

  it("returns empty string on immediate EOF from pipe", async () => {
    const input = Readable.from([]) as TTYInput;
    input.isTTY = false;
    const { stream } = createNullOutput();
    expect(await readMultiline({ input, output: stream })).toBe("");
  });

  it("handles pipe data split across multiple chunks", async () => {
    const input = Readable.from(["hel", "lo\nwor", "ld"]) as TTYInput;
    input.isTTY = false;
    const { stream } = createNullOutput();
    expect(await readMultiline({ input, output: stream })).toBe("hello\nworld");
  });
});
