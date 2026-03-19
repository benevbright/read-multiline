# シンタックスハイライト & Auto Editing 実装計画

## 現状分析

`read-multiline` は Node.js ターミナル向けの複数行入力ライブラリ。現在のレンダリングは **プレーンテキスト** のみで、行をそのまま `w(state, line)` で出力している。文字幅計算（CJK対応）はあるが、ANSI エスケープシーケンスによる装飾は未対応。

### レンダリングの現状（影響箇所）
- `rendering.ts`: `redrawFrom()`, `clearScreen()`, `restoreSnapshot()` — 行をプレーンテキストとして出力
- `editing.ts`: `insertChar()` — カーソル後の残りテキストをプレーンテキストで再描画
- `chars.ts`: `stringWidth()` — ANSI エスケープシーケンスを考慮しない

---

## Phase 1: シンタックスハイライト基盤

### 1-1. ハイライトコールバックの導入

**目標**: ユーザーが行ごとのハイライト関数を提供できるようにする

```ts
// types.ts に追加
interface ReadMultilineOptions {
  /**
   * 行テキストを受け取り、ANSIエスケープシーケンス付きの文字列を返す。
   * 行番号（0-indexed）も渡される。
   */
  highlight?: (line: string, lineIndex: number) => string;
}
```

**変更ファイル**: `types.ts`, `index.ts`（state初期化）

### 1-2. ANSI対応の文字幅計算

**目標**: ANSI エスケープシーケンスを含む文字列の表示幅を正しく計算する

- `chars.ts` に `stripAnsi(text: string): string` を追加
- `stringWidth()` のハイライト付きテキスト対応（既存の `stringWidth` はプレーンテキスト用のままで良い。ハイライト適用後のテキストに対しては `stripAnsi` してから幅計算するユーティリティを用意）

**変更ファイル**: `chars.ts`

### 1-3. レンダリングのハイライト対応

**目標**: 行を描画する際にハイライト関数を適用する

- `EditorState` に `highlight` 関数を保持
- レンダリング時に `state.highlight?.(line, rowIndex) ?? line` で装飾済みテキストを取得

**設計方針 — `renderLine()` の導入**:

行の描画を **`renderLine(state, rowIndex): string`** 関数に統一する。この関数がハイライトの有無を判定し、適切なテキストを返す。

```ts
function renderLine(state: EditorState, rowIndex: number): string {
  const line = state.lines[rowIndex];
  return state.highlight ? state.highlight(line, rowIndex) : line;
}
```

これにより、以下の全てのレンダリングパスで一貫したハイライト適用が実現される：

1. **`redrawFrom()`** — 複数行再描画（改行、行マージ、auto-indent の3行操作を含む）
2. **`clearScreen()`** — 全行再描画
3. **`restoreSnapshot()`** — undo/redo 後の全行再描画
4. **`insertChar()`** — ハイライト有効時は行全体再描画に切り替え

**重要**: auto-indent で括弧内改行時に3行操作（元行修正 + インデント行挿入 + 閉じ括弧行挿入）が発生するが、これは `insertNewline()` → `redrawFrom()` パスを通るため、`renderLine()` が `redrawFrom()` 内で使われていれば自動的にハイライト対応される。`insertChar()` の行全体再描画だけでは不十分であり、`redrawFrom()` のハイライト対応が **必須**。

**変更ファイル**: `rendering.ts`, `editing.ts`

### 1-4. カーソル位置の正確な管理

ハイライト適用後のテキストにはANSIコードが含まれるため、カーソル位置計算は引き続き **プレーンテキストの `state.lines[row]`** に基づいて行う。既存の `tCol()` はプレーンテキストベースなので変更不要。レンダリング時のみハイライト適用済みテキストを出力し、カーソル移動は従来通りプレーンテキスト幅で計算。

→ **変更なし**（設計上の確認事項）

---

## Phase 2: Auto Editing（自動編集）

### 2-1. 括弧の自動補完（Auto-close brackets）

**目標**: `(` を入力すると `)` が自動挿入され、カーソルが括弧の間に配置される

```ts
// types.ts に追加
interface ReadMultilineOptions {
  /**
   * 自動補完する括弧ペアの配列。
   * デフォルト: なし（自動補完無効）
   * 例: [["(", ")"], ["[", "]"], ["{", "}"], ["\"", "\""], ["'", "'"]]
   */
  autoPairs?: [string, string][];
}
```

**実装方針**:
- `editing.ts` の `insertChar()` 内で、入力文字が `autoPairs` の開き文字に一致する場合、閉じ文字も挿入
- 閉じ文字の直前にカーソルがある状態で閉じ文字を入力した場合は、挿入せずにカーソルを1つ右に移動（overtype）
- バックスペースで開き括弧を削除した際、直後に対応する閉じ括弧がある場合はそれも削除

**変更ファイル**: `types.ts`, `editing.ts`, `index.ts`

### 2-2. 自動インデント（Auto-indent on newline）

**目標**: 改行時に前の行のインデントを自動的に引き継ぐ

```ts
// types.ts に追加
interface ReadMultilineOptions {
  /**
   * 改行時のインデント処理関数。
   * 現在の行の内容とカーソル位置を受け取り、挿入するインデント文字列を返す。
   * デフォルト: なし（自動インデント無効）
   *
   * 例（前の行のインデントを引き継ぐ）:
   * (line) => line.match(/^(\s*)/)?.[1] ?? ""
   *
   * 例（{ の後にインデントを増やす）:
   * (line, col) => {
   *   const indent = line.match(/^(\s*)/)?.[1] ?? "";
   *   const beforeCursor = line.slice(0, col);
   *   return beforeCursor.trimEnd().endsWith("{") ? indent + "  " : indent;
   * }
   */
  indent?: (line: string, col: number) => string;
}
```

**実装方針**:
- `editing.ts` の `insertNewline()` で、改行後に `indent()` の戻り値を新しい行の先頭に挿入
- **括弧内改行の3行操作**: `autoPairs` と組み合わせ、カーソルが開き括弧と閉じ括弧の間にある状態（例: `func(|)`）で改行した場合:
  1. 元の行を分割（`func(` まで）
  2. 新しい行をインデント付きで挿入（カーソルはここ）
  3. 閉じ括弧を次の行にデインデントして配置
  ```
  // Before: func(|)
  // After:
  func(
      |          ← カーソル（indent で計算されたインデント）
  )              ← 元のインデントレベル
  ```
  - この操作は `insertNewline()` 内で行い、最終的に `redrawFrom(state, row, row + 1, indent.length)` を呼ぶ
  - `redrawFrom()` が `renderLine()` を使ってハイライト付き描画するため、Phase 1 のハイライト実装との互換性は自動的に確保される

**変更ファイル**: `types.ts`, `editing.ts`, `index.ts`

---

## Phase 3: 統合と最適化

### 3-1. ハイライト + Auto Editing の統合テスト

- ハイライト有効時の auto-close/auto-indent が正しく動作することを確認
- undo/redo がペア挿入を正しく扱えることを確認（ペア挿入は1つの undo 単位）
- ペースト時は auto-close を無効にする（既存の `isPasting` フラグを活用）

### 3-2. パフォーマンス考慮

#### ハイライト関数の呼び出しコスト

`highlight()` はユーザー提供の関数であり、コストが高い可能性がある（例: 正規表現ベースのトークナイザー）。

**最適化戦略**:

1. **キャッシュの導入**: 行内容が変わっていない行のハイライト結果をキャッシュする
   ```ts
   // EditorState に追加
   highlightCache: Map<string, string>;  // lineContent → highlightedContent
   ```
   - `renderLine()` 内でキャッシュを参照し、ヒットすれば `highlight()` を呼ばない
   - キャッシュキーは行テキスト（同じ内容なら同じハイライト結果になる前提）
   - キャッシュサイズ上限を設ける（例: 最大 1000 エントリ、LRU）
   - **注意**: `highlight(line, lineIndex)` が行番号依存の装飾を行う場合、キャッシュキーに行番号を含める必要がある。ただし一般的なシンタックスハイライトは行番号非依存なので、デフォルトでは行内容のみをキーとする。行番号依存が必要な場合はキャッシュを無効化するオプションを提供。

2. **再描画範囲の最小化**:
   - `insertChar()`: ハイライト有効時でも**現在行のみ**再描画（`redrawFrom()` ではなく行単体の再描画）
   - `redrawFrom()`: 変更行以降を再描画（現行通り）。auto-indent の3行操作でも `fromRow` 以降のみ
   - **変更のない行をスキップ**: `redrawFrom()` で、変更前後で行内容が同じ行の再描画をスキップできるか検討（ただしカーソル移動のコストとのトレードオフ）

3. **フリッカー防止**:
   - `beginBatch()`/`flushBatch()` でバッファリング（既存インフラ活用）
   - ハイライト適用後のテキスト出力前に `\x1b[?2026h` (synchronized output) を検討（ターミナル対応状況による）

#### `insertChar()` のパフォーマンス

現在のインクリメンタル描画（挿入文字+残りテキストのみ出力）は高速。ハイライト有効時に行全体再描画に切り替えるとコスト増だが：
- 1行分のハイライト計算 + ANSI出力なので、通常は十分高速
- キャッシュにより `highlight()` の呼び出しは実質キャッシュミス時のみ
- `beginBatch()`/`flushBatch()` でフリッカーを防止

#### `redrawFrom()` の大量行再描画

ファイル末尾に近い行の変更では再描画行数が少ないが、先頭付近の変更では全行再描画になる。
- 行数が多い場合（100行超など）、ハイライト関数の累積コストが顕在化する可能性
- キャッシュにより軽減されるが、全行キャッシュミス（例: ペースト直後）はボトルネックになりうる
- 対策: `redrawFrom()` 内で変更行のみハイライト再計算し、他の行はキャッシュから取得

---

## 実装順序（推奨）

| ステップ | 内容 | 影響範囲 |
|---------|------|---------|
| **Step 1** | `highlight` オプション + レンダリング対応 | `types.ts`, `rendering.ts`, `editing.ts`, `index.ts`, `chars.ts` |
| **Step 2** | `autoPairs` オプション（括弧自動補完） | `types.ts`, `editing.ts`, `index.ts` |
| **Step 3** | `indent` オプション（自動インデント） | `types.ts`, `editing.ts`, `index.ts` |
| **Step 4** | テスト追加 | `editing.test.ts` 等 |

各ステップは独立してリリース可能。Step 1 が最も影響範囲が広く、Step 2/3 は比較的局所的な変更。

---

## API サマリー

```ts
readMultiline("> ", {
  // シンタックスハイライト
  highlight: (line, index) => highlightJS(line),

  // 括弧自動補完
  autoPairs: [["(", ")"], ["[", "]"], ["{", "}"], ["\"", "\""]],

  // 自動インデント
  indent: (line, col) => {
    const base = line.match(/^(\s*)/)?.[1] ?? "";
    return line.slice(0, col).trimEnd().endsWith("{") ? base + "  " : base;
  },
});
```
