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
- 影響箇所:
  - `rendering.ts`: `redrawFrom()`, `clearScreen()`, `restoreSnapshot()` の行出力部分
  - `editing.ts`: `insertChar()` の残りテキスト再描画部分（ハイライト適用時は行全体を再描画する方式に変更）

**設計判断**: `insertChar()` でのインクリメンタル描画（現在は挿入文字+残りテキストのみ書く）は、ハイライトが有効な場合は**行全体の再描画**に切り替える。ハイライトにより前後の文字の色が変わる可能性があるため。

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
- `autoPairs` と組み合わせ: `{` の後に改行した場合、閉じ `}` が次行にある場合はさらに1行追加して閉じ括弧を適切なインデントで配置（これはオプションの `indent` 関数の責務外 — 将来的な拡張として検討）

**変更ファイル**: `types.ts`, `editing.ts`, `index.ts`

---

## Phase 3: 統合と最適化

### 3-1. ハイライト + Auto Editing の統合テスト

- ハイライト有効時の auto-close/auto-indent が正しく動作することを確認
- undo/redo がペア挿入を正しく扱えることを確認（ペア挿入は1つの undo 単位）
- ペースト時は auto-close を無効にする（既存の `isPasting` フラグを活用）

### 3-2. パフォーマンス考慮

- ハイライト関数は行ごとに呼ばれるため、`redrawFrom()` では変更行以降のみ再描画（現行通り）
- `insertChar()` でハイライト有効時に行全体再描画に切り替えるが、`beginBatch()`/`flushBatch()` でフリッカーを防止

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
