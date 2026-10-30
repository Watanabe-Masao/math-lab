// 実験室のエンジン v0（#102・#115）：起き方と理論のモデル・1セットの並び・記録の型。性質で確かめる。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { comb, createRandom, drawSet, emptySetRecord, modelMoments, modelOf, modelPmf, runSets, summarize, checkMechanism, supportOf, type Mechanism } from "../src";

const mech = fc.oneof(
  fc.record({ kind: fc.constant("bernoulli" as const), n: fc.integer({ min: 1, max: 30 }), p: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.integer({ min: 1, max: 40 }).chain((total) => fc.record({ kind: fc.constant("urn" as const), total: fc.constant(total), success: fc.integer({ min: 0, max: total }), n: fc.integer({ min: 1, max: total }) })),
  fc.record({ kind: fc.constant("streak" as const), n: fc.integer({ min: 1, max: 30 }), p: fc.double({ min: 0, max: 1, noNaN: true }), carry: fc.double({ min: 0, max: 0.5, noNaN: true }) }),
  fc.record({ kind: fc.constant("mix" as const), n: fc.integer({ min: 1, max: 30 }), p: fc.double({ min: 0, max: 1, noNaN: true }), spread: fc.double({ min: 0, max: 0.5, noNaN: true }) }),
  fc.integer({ min: 1, max: 6 }).chain((k) => fc.record({ kind: fc.constant("table" as const), n: fc.integer({ min: 1, max: 3 }),
    values: fc.array(fc.integer({ min: -5, max: 20 }), { minLength: k, maxLength: k }), weights: fc.array(fc.integer({ min: 0, max: 5 }), { minLength: k, maxLength: k }) }))
    .filter((m) => m.weights.some((w) => w > 0)),
) as fc.Arbitrary<Mechanism>;

describe("1セットの並び", () => {
  it("長さ n の 0/1。戻さずに取るときは当たりの数を超えない", () => {
    fc.assert(fc.property(mech, fc.integer(), (m, seed) => {
      const s = drawSet(createRandom(seed), m);
      expect(s).toHaveLength(m.n);
      if (m.kind === "table") expect(s.every((x) => m.values.some((v, j) => v === x && m.weights[j]! > 0))).toBe(true);   // 重み0の値は出ない
      else expect(s.every((x) => x === 0 || x === 1)).toBe(true);
      if (m.kind === "urn") { const k = s.reduce((a, b) => a + b, 0); expect(k).toBeLessThanOrEqual(m.success); expect(m.n - k).toBeLessThanOrEqual(m.total - m.success); }
    }));
  });
  it("箱を全部取ると、当たりの数はいつも同じ", () => {
    expect(drawSet(createRandom(1), { kind: "urn", n: 10, total: 10, success: 4 }).reduce((a, b) => a + b, 0)).toBe(4);
  });
  it("おかしな条件は理由を言って止まる", () => {
    expect(checkMechanism({ kind: "urn", n: 5, total: 3, success: 1 })).toMatch(/戻さずに取る/);
    expect(checkMechanism({ kind: "bernoulli", n: 0, p: 0.5 })).toMatch(/n は1以上/);
    expect(() => drawSet(createRandom(1), { kind: "bernoulli", n: 3, p: 2 })).toThrow(/p は 0〜1/);
  });
});

describe("記録", () => {
  it("同じ種なら同じ結果。何回に分けて起こしても同じ（100＝10×10）", () => {
    fc.assert(fc.property(mech, fc.integer(), (m, seed) => {
      const a = runSets(createRandom(seed), emptySetRecord(seed, m), 100);
      const r = createRandom(seed); let b = emptySetRecord(seed, m);
      for (let i = 0; i < 10; i++) b = runSets(r, b, 10);
      expect(b).toEqual(a);
    }), { numRuns: 40 });
  });
  it("k ごとの回数・合計・セットの数がそろう。元の記録は変えない", () => {
    const m: Mechanism = { kind: "bernoulli", n: 10, p: 0.3 };
    const r0 = emptySetRecord(7, m), r = runSets(createRandom(7), r0, 50);
    expect(r0.sets).toBe(0);
    expect(r.sets).toBe(50);
    expect(r.counts.reduce((a, b) => a + b, 0)).toBe(50);
    expect(r.sum).toBe(r.ks.reduce((a, b) => a + b, 0));
    expect(r.last).toHaveLength(10);
    expect(r.version).toBe(2);
    expect(r.support).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("決まった種の最初の結果を固定する（方式を変えると既存の実験の再現が崩れる）", () => {
    const r = runSets(createRandom(12345), emptySetRecord(12345, { kind: "bernoulli", n: 10, p: 0.5 }), 5);
    expect(r.ks).toEqual([4, 4, 5, 6, 3]);
  });
});

describe("理論のモデル", () => {
  it("確率の和は1。二項は ₙCₖ pᵏ(1−p)ⁿ⁻ᵏ、期待値と分散は定義と一致", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 40 }), fc.double({ min: 0, max: 1, noNaN: true }), (n, p) => {
      const f = modelPmf({ kind: "binom", n, p });
      expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      f.forEach((v, k) => expect(v).toBeCloseTo(comb(n, k) * p ** k * (1 - p) ** (n - k), 9));
      const mu = f.reduce((s, v, k) => s + k * v, 0), va = f.reduce((s, v, k) => s + (k - mu) ** 2 * v, 0);
      const mm = modelMoments({ kind: "binom", n, p });
      expect(mm.mean).toBeCloseTo(mu, 8); expect(mm.variance).toBeCloseTo(va, 8);
    }));
  });
  it("超幾何の確率の和は1、期待値・分散（有限母集団の修正つき）が定義と一致", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 60 }).chain((t) => fc.tuple(fc.constant(t), fc.integer({ min: 0, max: t }), fc.integer({ min: 1, max: t }))), ([total, success, n]) => {
      const m = { kind: "hyper" as const, n, total, success }, f = modelPmf(m);
      expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      const mu = f.reduce((s, v, k) => s + k * v, 0), va = f.reduce((s, v, k) => s + (k - mu) ** 2 * v, 0);
      expect(modelMoments(m).mean).toBeCloseTo(mu, 8); expect(modelMoments(m).variance).toBeCloseTo(va, 8);
    }));
  });
});

// 回数を増やすと理論に近づく（許す幅は標準誤差の5倍）
const near = (m: Mechanism, seed: number, N = 4000) => {
  const s = summarize(runSets(createRandom(seed), emptySetRecord(seed, m), N));
  return s;
};
describe("起き方が理論に近づく・ずれる", () => {
  it("独立で同じ確率なら、平均は np（二項）", () => {
    for (const seed of [1, 2, 3]) {
      const m: Mechanism = { kind: "bernoulli", n: 10, p: 0.3 }, { mean, variance } = modelMoments(modelOf(m)!);
      expect(Math.abs(near(m, seed).mean! - mean)).toBeLessThan(5 * Math.sqrt(variance / 4000));
    }
  });
  it("戻さずに取ると超幾何に近づき、二項より散らばりが小さい（使えない場面の1つ）", () => {
    const m: Mechanism = { kind: "urn", n: 10, total: 20, success: 6 }, h = modelMoments(modelOf(m)!), s = near(m, 5);
    expect(Math.abs(s.mean! - h.mean)).toBeLessThan(5 * Math.sqrt(h.variance / 4000));
    expect(s.variance!).toBeLessThan(modelMoments({ kind: "binom", n: 10, p: 0.3 }).variance);
  });
  it("セットごとに確率がばらつくと（同じ p でない）、平均は np のままでも散らばりが大きい", () => {
    const s = near({ kind: "mix", n: 10, p: 0.5, spread: 0.3 }, 11), b = modelMoments({ kind: "binom", n: 10, p: 0.5 });
    expect(Math.abs(s.mean! - b.mean)).toBeLessThan(0.15);
    expect(s.variance!).toBeGreaterThan(b.variance * 1.5);   // 理論：np(1−p)＋n(n−1)spread² ＝ 2.5＋8.1
  });
  it("前の結果に引きずられても平均は np のまま（p が高くても 1 に張り付かない）、散らばりは大きい", () => {
    const s8 = near({ kind: "streak", n: 10, p: 0.8, carry: 0.3 }, 13), b8 = modelMoments({ kind: "binom", n: 10, p: 0.8 });
    expect(Math.abs(s8.mean! - b8.mean)).toBeLessThan(0.15);
    expect(s8.variance!).toBeGreaterThan(b8.variance * 1.3);
  });
  it("性質：どの p・carry でも、引きずられる起き方の平均は np のまま、散らばりは二項以上（p＝0.5 だけで確かめて見逃した誤りを防ぐ）", () => {
    fc.assert(fc.property(fc.integer({ min: 5, max: 20 }), fc.double({ min: 0.05, max: 0.95, noNaN: true }), fc.double({ min: 0.15, max: 0.6, noNaN: true }), fc.integer({ min: 0, max: 2 ** 31 }), (n, p, carry, seed) => {
      const s = near({ kind: "streak", n, p, carry }, seed, 3000), b = modelMoments({ kind: "binom", n, p });
      expect(Math.abs(s.mean! - b.mean)).toBeLessThan(5 * Math.sqrt(s.variance! / 3000) + 1e-9);
      expect(s.variance!).toBeGreaterThan(b.variance);
    }), { numRuns: 25 });
  });
  it("前の結果に引きずられると（独立でない）、二項より散らばりが大きい", () => {
    const s = near({ kind: "streak", n: 10, p: 0.5, carry: 0.3 }, 9);
    expect(s.variance!).toBeGreaterThan(modelMoments({ kind: "binom", n: 10, p: 0.5 }).variance * 1.3);
  });
});

// 値の表（くじ・さいころ。#119）：とる値・確率の和・期待値と分散が定義どおり、引いた平均は期待値に近づく
describe("値の表の起き方", () => {
  const tbl = fc.integer({ min: 1, max: 6 }).chain((k) => fc.tuple(fc.array(fc.integer({ min: -10, max: 30 }), { minLength: k, maxLength: k }), fc.array(fc.integer({ min: 0, max: 6 }), { minLength: k, maxLength: k }), fc.integer({ min: 1, max: 3 })))
    .filter(([, w]) => w.some((x) => x > 0));
  it("性質：確率の和は1、期待値と分散は値×確率の定義と一致（n 回足すと n 倍）", () => {
    fc.assert(fc.property(tbl, ([values, weights, n]) => {
      const m = { kind: "table" as const, n, values, weights }, f = modelPmf(m), sup = supportOf(m);
      expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(sup).toHaveLength(f.length);
      const mu = f.reduce((s, v, i) => s + sup[i]! * v, 0), va = f.reduce((s, v, i) => s + (sup[i]! - mu) ** 2 * v, 0);
      expect(modelMoments(m).mean).toBeCloseTo(mu, 8); expect(modelMoments(m).variance).toBeCloseTo(va, 7);
    }));
  });
  it("性質：引いた平均は期待値に近づく（標準誤差の5倍）。とる値の一覧の外は出ない", () => {
    fc.assert(fc.property(tbl, fc.integer(), ([values, weights, n], seed) => {
      const m = { kind: "table" as const, n, values, weights }, r = runSets(createRandom(seed), emptySetRecord(seed, m), 3000), s = summarize(r);
      const mm = modelMoments(m);
      expect(Math.abs(s.mean! - mm.mean)).toBeLessThan(5 * Math.sqrt(mm.variance / 3000) + 1e-9);
      expect(r.counts.reduce((a, b) => a + b, 0)).toBe(3000);
    }), { numRuns: 30 });
  });
  it("端：値が1つなら毎回その値。さいころの期待値は 3.5", () => {
    const one = runSets(createRandom(3), emptySetRecord(3, { kind: "table", n: 1, values: [7], weights: [1] }), 20);
    expect(new Set(one.ks)).toEqual(new Set([7]));
    expect(modelMoments({ kind: "table", n: 1, values: [1, 2, 3, 4, 5, 6], weights: [1, 1, 1, 1, 1, 1] }).mean).toBeCloseTo(3.5, 12);
    expect(checkMechanism({ kind: "table", n: 1, values: [1, 2], weights: [0, 0] })).toMatch(/重み/);
  });
});

