// 監査で見つかった不具合の再発を止める（stats2-course #142）。どれも、直す前のコードで落ちることを確かめた。
import { describe, expect, it } from "vitest";
import { decodeCard, emptySetRecord, encodeCard, evaluate, expand, modelMoments, summarize, type FormulaNode, type SetRecord } from "../src";

// 確かめる対象：値を入れて1段ずつ展開した最後の値が、evaluate と同じか（式を開いても・展開しても値は変わらない。#109）。
// 想定する故障：Σ・Π の動かす記号（束縛変数）まで外の同じ名前の値で置き換える（Σ_{x=1}^{3} x を x＝10 で 30 にしていた）。
// 見つけ方：外に同じ名前の値がある Σ・Π・入れ子の Σ を展開し、最後の数を evaluate と比べる。
// 既存との違い：correctness.test.ts のスコープは openSymbol（式を開く）の付け替えを見ていて、展開（substitute）は見ていなかった
describe("展開は束縛された記号を外の値で置き換えない", () => {
  const sum = (v: string, lo: FormulaNode, hi: FormulaNode, body: FormulaNode): FormulaNode => ({ op: "sum", var: v, lower: lo, upper: hi, args: [body] });
  const last = (t: FormulaNode, values: Record<string, number>) => { const s = expand(t, { values }); return evaluate(s[s.length - 1]!, {}); };
  it("Σ_{x=1}^{3} x は外に x＝10 があっても 6", () => {
    const t = sum("x", { num: 1 }, { num: 3 }, { sym: "x" });
    expect(evaluate(t, { values: { x: 10 } })).toBe(6);
    expect(last(t, { x: 10 })).toBe(6);
  });
  it("端は外の値を使う：Σ_{x=1}^{n} x·a（n＝4・a＝2・外の x＝10）は 20。Π も同じ", () => {
    const t = sum("x", { num: 1 }, { sym: "n" }, { op: "mul", args: [{ sym: "x" }, { sym: "a" }] });
    expect(last(t, { n: 4, a: 2, x: 10 })).toBe(20);
    const p: FormulaNode = { op: "prod", var: "i", lower: { num: 1 }, upper: { sym: "n" }, args: [{ sym: "i" }] };
    expect(last(p, { n: 4, i: 7 })).toBe(24);
  });
  it("入れ子：Σ_{i=1}^{2} Σ_{j=1}^{i} j は外に i・j があっても 4", () => {
    const t = sum("i", { num: 1 }, { num: 2 }, sum("j", { num: 1 }, { sym: "i" }, { sym: "j" }));
    expect(last(t, { i: 9, j: 9 })).toBe(4);
  });
});

// 確かめる対象：値の表の分散と、記録の分散。想定する故障：E(X²)−μ² の引き算の桁落ち（10億と10億＋1 が半々で、0.25 が 0 になっていた）。
// 見つけ方：大きな値の近い2点の分布で 0.25 になるか。既存との違い：今までの表は小さな値だけで、桁落ちが起きなかった
describe("大きな値でも分散は桁落ちしない", () => {
  it("値の表のモデル：10億と10億＋1 が半々で 0.25", () => {
    expect(modelMoments({ kind: "table", n: 1, values: [1e9, 1e9 + 1], weights: [1, 1] }).variance).toBeCloseTo(0.25, 12);
  });
  it("記録のまとめ：10億と10億＋1 が交互で 0.25", () => {
    const base = emptySetRecord(1, { kind: "table", n: 1, values: [1e9, 1e9 + 1], weights: [1, 1] });
    const ks = [1e9, 1e9 + 1, 1e9, 1e9 + 1];
    const rec: SetRecord = { ...base, sets: 4, ks, counts: [2, 2], sum: ks.reduce((a, b) => a + b, 0), sumSq: ks.reduce((a, b) => a + b * b, 0) };
    expect(summarize(rec).variance).toBeCloseTo(0.25, 12);
  });
});

// 確かめる対象：共有 URL のカードを戻すときの上限。想定する故障：n＝10億などが受理され、開いたときに巨大な計算で画面が固まる。
// 見つけ方：上限を越える n・n×セット数を戻すと捨てる（undefined）。ふつうのカードは戻る。既存との違い：今まではセット数だけに上限があった
describe("共有カードは回数の上限を越えると捨てる", () => {
  const card = (n: number, sets: number) => encodeCard({ mechanism: { kind: "bernoulli", n, p: 0.5 }, sets, seed: 1 });
  it("n が上限を越える・n×セット数が大きすぎるカードは捨てる", () => {
    expect(decodeCard(card(1_000_000_000, 1))).toBeUndefined();
    expect(decodeCard(card(1001, 1))).toBeUndefined();
    expect(decodeCard(card(1000, 100000))).toBeUndefined();
  });
  it("ふつうのカードは戻る", () => {
    expect(decodeCard(card(30, 600))?.mechanism).toEqual({ kind: "bernoulli", n: 30, p: 0.5 });
  });
});
