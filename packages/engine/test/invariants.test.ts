// 守るべき決まりを、入力を広く変えて直接確かめる（stats2-course #142：渡辺さんの分析 2026-11-01）。
// 特定の例だけのテストは偶然で通る（外の x＝2 なら、Σ の x を誤って置き換えても 2+2+2＝6）。ここは誤りの種類をまとめて見つける性質で確かめる。
// audit.test.ts（#142 の例）は、ここで同じ故障が見つかるので、性質で置き換えた（例の値は性質の入力の中に入る）。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createRandom, decodeCard, emptySetRecord, encodeCard, evaluate, expand, MAX_CARD_DRAWS, MAX_CARD_N, MAX_CARD_SETS, modelMoments, runSets, summarize,
  type Card, type FormulaNode,
} from "../src";

// ---- 1. 式：どう展開しても値は変わらない ----
// 確かめる対象：expand の全部の段（値を入れた式・1段ずつ計算した式）の値が、元の式の evaluate と同じ。
// 想定する故障：Σ・Π の動かす記号を外の同じ名前の値で置き換える（束縛の取り違え）・端と中身の範囲の取り違え・1段の計算の誤り。
// 見つけ方：Σ・Π（入れ子・端に外の記号）と、外に同じ名前の値がある木を乱数で作り、全部の段を evaluate して比べる。
// 既存との違い：correctness.test.ts の展開の性質は Σ のない木だけ、audit.test.ts は3つの例だけだった
const NAMES = ["x", "i", "k", "n", "a"] as const;
const leaf: fc.Arbitrary<FormulaNode> = fc.oneof(
  fc.integer({ min: -3, max: 3 }).map((num) => ({ num })),
  fc.constantFrom(...NAMES).map((sym) => ({ sym })),
);
const tree: fc.Arbitrary<FormulaNode> = fc.letrec<{ t: FormulaNode }>((tie) => ({
  t: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    leaf,
    fc.tuple(fc.constantFrom("add", "sub", "mul"), tie("t"), tie("t")).map(([op, a, b]) => ({ op, args: [a, b] }) as FormulaNode),
    fc.tuple(tie("t"), fc.integer({ min: 0, max: 2 })).map(([a, e]) => ({ op: "pow", args: [a, { num: e }] }) as FormulaNode),
    // Σ・Π：動かす記号は外と同じ名前もとる。上端は数か外の記号 n（端は外側の記号）
    fc.tuple(fc.constantFrom("sum", "prod"), fc.constantFrom(...NAMES), fc.integer({ min: 0, max: 2 }), fc.oneof(fc.integer({ min: 0, max: 3 }).map((num) => ({ num }) as FormulaNode), fc.constant({ sym: "n" } as FormulaNode)), tie("t"))
      .map(([op, v, lo, hi, body]) => ({ op, var: v, lower: { num: lo }, upper: hi, args: [body] }) as FormulaNode),
  ),
})).t;
const env = fc.record(Object.fromEntries(NAMES.map((k) => [k, fc.integer({ min: -2, max: 4 })])) as Record<(typeof NAMES)[number], fc.Arbitrary<number>>)
  .map((v) => ({ ...v, n: Math.abs(v.n) }));
const same = (a: number | undefined, b: number) => a !== undefined && (a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));

describe("式：どう展開しても値は変わらない", () => {
  it("乱数の木（Σ・Π・入れ子・外に同じ名前の値）で、展開の全部の段の値＝evaluate", () => {
    fc.assert(fc.property(tree, env, (t, values) => {
      const want = evaluate(t, { values });
      fc.pre(want !== undefined && Number.isFinite(want) && Math.abs(want) < 1e12);
      const steps = expand(t, { values });
      for (const s of steps) if (!same(evaluate(s, { values }), want!)) return false;
      return "num" in steps[steps.length - 1]!;   // 最後は数になる（途中で止まらない）
    }), { numRuns: 400 });
  });
  it("#142 の例（Σ_{x=1}^{3} x、外の x＝10）は性質の入力に入る", () => {
    const t: FormulaNode = { op: "sum", var: "x", lower: { num: 1 }, upper: { num: 3 }, args: [{ sym: "x" }] };
    const s = expand(t, { values: { x: 10 } });
    expect(evaluate(s[s.length - 1]!, {})).toBe(6);
  });
});

// ---- 2. 数値：全部に同じ数を足しても分散は変わらず、a 倍で a² 倍 ----
// 確かめる対象：値の表のモデル（modelMoments）と、実験の記録のまとめ（summarize）の分散。
// 想定する故障：E(X²)−μ² の引き算の桁落ち（大きな値で 0 や負になる）・平均のずれ。見つけ方：小さな整数の表に 1e9 などを足した表・a 倍した表で比べる。
// 既存との違い：今までの表は小さな値だけで、桁落ちが起きない入力だった
const tableArb = fc.integer({ min: 2, max: 6 }).chain((m) => fc.tuple(
  fc.uniqueArray(fc.integer({ min: -20, max: 20 }), { minLength: m, maxLength: m }).map((v) => v.sort((a, b) => a - b)),
  fc.array(fc.integer({ min: 1, max: 9 }), { minLength: m, maxLength: m }),
));
const SHIFTS = [0, 1e9, -1e9, 123456.75, 1e12];
describe("数値：分散は平行移動で変わらず、a 倍で a² 倍", () => {
  it("値の表のモデル", () => {
    fc.assert(fc.property(tableArb, fc.constantFrom(...SHIFTS), fc.constantFrom(-3, 0.5, 2), ([values, weights], c, a) => {
      const v0 = modelMoments({ kind: "table", n: 1, values, weights }).variance;
      const vs = modelMoments({ kind: "table", n: 1, values: values.map((x) => x + c), weights }).variance;
      const va = modelMoments({ kind: "table", n: 1, values: values.map((x) => a * x), weights }).variance;
      return Math.abs(vs - v0) <= 1e-6 * Math.max(1, v0) && Math.abs(va - a * a * v0) <= 1e-9 * Math.max(1, a * a * v0);
    }), { numRuns: 200 });
  });
  it("実験の記録のまとめ（同じ種で、値を平行移動した表）", () => {
    fc.assert(fc.property(tableArb, fc.constantFrom(...SHIFTS), fc.integer({ min: 1, max: 2 ** 31 }), ([values, weights], c, seed) => {
      const rec = (vs: number[]) => runSets(createRandom(seed), emptySetRecord(seed, { kind: "table", n: 1, values: vs, weights }), 200);
      const v0 = summarize(rec(values)).variance!, vs = summarize(rec(values.map((x) => x + c))).variance!;
      return Math.abs(vs - v0) <= 1e-6 * Math.max(1, v0);
    }), { numRuns: 60 });
  });
});

// ---- 3. 入力：URL のカードは、符号化して戻すと同じで、上限を越えたものは受け付けない ----
// 確かめる対象：共有カードの encode → decode の往復と、受け付ける大きさ（1セットの回数・回の合計・セット数）。
// 想定する故障：往復で値が変わる（丸め・区切り）・数学的に正しくても処理できない大きさを受け付ける（n＝10億）。
// 見つけ方：上限の内外にまたがる n・セット数でカードの文字を作り、戻した結果が上限の中か・中のものは同じに戻るか
describe("入力：共有カードの往復と大きさの上限", () => {
  const P = fc.integer({ min: 0, max: 100 }).map((x) => x / 100);
  it("上限の中のカードは、文字にして戻すと同じ", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: MAX_CARD_N }), P, fc.integer({ min: 0, max: MAX_CARD_SETS }), fc.integer({ min: 0, max: 2 ** 32 }), (n, p, sets, seed) => {
      fc.pre(n * sets <= MAX_CARD_DRAWS);
      const c: Card = { mechanism: { kind: "bernoulli", n, p }, sets, seed };
      expect(decodeCard(encodeCard(c))).toEqual(c);
    }), { numRuns: 300 });
  });
  it("どんな大きさの文字でも、受け付けたカードは上限の中", () => {
    fc.assert(fc.property(fc.oneof(fc.integer({ min: 1, max: 2000 }), fc.constantFrom(1e9, 10 ** 15)), P, fc.oneof(fc.integer({ min: 0, max: 200000 }), fc.constant(10 ** 12)), (n, p, sets) => {
      const c = decodeCard(`b${n}_${p}_${sets}_1`);
      return !c || (c.mechanism.n <= MAX_CARD_N && c.sets <= MAX_CARD_SETS && c.mechanism.n * c.sets <= MAX_CARD_DRAWS);
    }), { numRuns: 300 });
  });
});
