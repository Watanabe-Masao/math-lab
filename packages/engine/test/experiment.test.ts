// 実験エンジン：同じ種なら同じ結果、回数を増やすと割合は確率に・平均は期待値に近づく（許す幅は標準誤差の5倍）
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import formulas from "./fixtures/stats2-formulas.json";
import { createRandom, distribution, emptyRecord, evaluate, frequencies, rhsOf, runTrials, sampleDiscrete, type Formula } from "../src";

const binom = (formulas as (Formula & { concept: string; index: number })[]).find((f) => f.concept === "TERM-binom" && f.index === 0)!;
const mean = (formulas as (Formula & { concept: string; index: number })[]).find((f) => f.concept === "TERM-binom" && f.index === 1)!;

describe("実験エンジン", () => {
  it("同じ種なら同じ結果（この実験をもう一度）", () => {
    const d = distribution(binom.tree, "k", 0, 10, { values: { n: 10, p: 0.3 } });
    const a = runTrials(createRandom(42), d, 100), b = runTrials(createRandom(42), d, 100);
    expect(a.values).toEqual(b.values);
    expect(runTrials(createRandom(43), d, 100).values).not.toEqual(a.values);
  });
  it("記録に足していける（元の記録は変えない）", () => {
    const d = distribution(binom.tree, "k", 0, 10, { values: { n: 10, p: 0.3 } });
    const rng = createRandom(1), r1 = runTrials(rng, d, 1), r2 = runTrials(rng, d, 99, r1);
    expect([r1.values.length, r2.values.length]).toEqual([1, 100]);
    expect([...r2.counts.values()].reduce((s, c) => s + c, 0)).toBe(100);
    expect(emptyRecord().mean).toBeUndefined();
  });
  it("性質：回数を増やすと、平均は期待値 np に、割合は確率に近づく", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.integer({ min: 0, max: 2 ** 31 }), (n, p, seed) => {
      const d = distribution(binom.tree, "k", 0, n, { values: { n, p } }), N = 4000;
      const rec = runTrials(createRandom(seed), d, N);
      const mu = evaluate(rhsOf(mean.tree), { values: { n, p } })!, sd = Math.sqrt(n * p * (1 - p));
      expect(Math.abs(rec.mean! - mu)).toBeLessThan(5 * sd / Math.sqrt(N) + 1e-9);
      const f = frequencies(rec);
      // とても小さい確率（Ny が 1 に届かない値）は正規近似が使えないので、分散の下限を 1/N にする（5回までの偶然は許す）
      for (const { x, y } of d) expect(Math.abs((f.get(x) ?? 0) - y!)).toBeLessThan(5 * Math.sqrt(Math.max(y! * (1 - y!), 1 / N) / N) + 1e-9);
    }), { numRuns: 40 });
  });
  it("確率が0の値は出ない・すべて0の分布は止める", () => {
    const rng = createRandom(7);
    for (let i = 0; i < 200; i++) expect(sampleDiscrete(rng, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: undefined }])).toBe(1);
    expect(() => sampleDiscrete(rng, [{ x: 0, y: 0 }])).toThrow();
  });
});
