// ラボが使う引き方（normal・shuffle・sampleWithout。stats2-course #144 P6）。
// 種は固定する（チェックのたびに種が変わって偶然落ちる運用にしない。渡辺さん 2026-11-01）。
// 理論との整合は、理論値と標準誤差を定義できる統計量（平均・割合・分散）にだけ、標準誤差の5倍の幅で当てる。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRandom, normal, sampleWithout, shuffle } from "../src";

// 確かめる対象：標準正規の数。想定する故障：Box–Muller の式の誤り（√(−2 log u) の取り違え・cos の周期）、u＝0 で無限。
// 見つけ方：固定の種で2万個引き、平均（理論 0・標準誤差 1/√n）と分散（理論 1・標準誤差 √(2/n)）を5倍の幅で照らす。有限であること
describe("normal：標準正規分布", () => {
  it("平均 0・分散 1 に、標準誤差の5倍の幅で合う（種 2026・2万個）", () => {
    const r = createRandom(2026), n = 20000;
    const xs = Array.from({ length: n }, () => normal(r));
    expect(xs.every(Number.isFinite)).toBe(true);
    const m = xs.reduce((a, b) => a + b, 0) / n;
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / n;
    expect(Math.abs(m)).toBeLessThan(5 / Math.sqrt(n));
    expect(Math.abs(v - 1)).toBeLessThan(5 * Math.sqrt(2 / n));
  });
});

// 確かめる対象：並べ替えと、戻さずに引く。想定する故障：要素が落ちる・重なる・元の配列を変える・位置に偏り（Fisher–Yates の範囲の誤り）・同じ種で違う結果。
// 見つけ方：並べ替えは元の要素の並べ替えか（性質）、同じ種なら同じか。偏りは、固定の種で1万回並べ替えて、要素0が各位置に来る割合（理論 1/5、標準誤差 √(0.16/n)）を5倍の幅で
describe("shuffle・sampleWithout", () => {
  it("どの配列・どの種でも、元の要素の並べ替えで、元は変えず、同じ種なら同じ", () => {
    fc.assert(fc.property(fc.array(fc.integer(), { maxLength: 30 }), fc.integer({ min: 0, max: 2 ** 32 }), (xs, seed) => {
      const before = xs.slice();
      const a = shuffle(createRandom(seed), xs), b = shuffle(createRandom(seed), xs);
      expect(xs).toEqual(before);
      expect(a).toEqual(b);
      expect(a.slice().sort((p, q) => p - q)).toEqual(xs.slice().sort((p, q) => p - q));
    }), { numRuns: 200 });
  });
  it("位置に偏りがない：要素0が各位置に来る割合は 1/5 に、標準誤差の5倍の幅で合う（種 7・1万回）", () => {
    const r = createRandom(7), n = 10000, at = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) at[shuffle(r, [0, 1, 2, 3, 4]).indexOf(0)]! += 1;
    for (const c of at) expect(Math.abs(c / n - 0.2)).toBeLessThan(5 * Math.sqrt(0.16 / n));
  });
  it("戻さずに k 個：重ならず、元の中から。k が範囲の外なら止める", () => {
    const r = createRandom(3);
    const s = sampleWithout(r, [10, 20, 30, 40, 50], 3);
    expect(new Set(s).size).toBe(3);
    expect(s.every((x) => [10, 20, 30, 40, 50].includes(x))).toBe(true);
    expect(() => sampleWithout(r, [1, 2], 3)).toThrow();
  });
});
