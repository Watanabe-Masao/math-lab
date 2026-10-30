// 種つき乱数の性質：同じ種なら同じ並び・範囲・回数を増やすと一様に近づく
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRandom, normalizeSeed } from "../src";

const seed = fc.integer({ min: 0, max: 2 ** 32 - 1 });

describe("createRandom", () => {
  it("同じ種なら同じ並び（再現できる）", () => {
    fc.assert(fc.property(seed, (s) => {
      const a = createRandom(s), b = createRandom(s);
      for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
    }));
  });

  it("next は 0 以上 1 未満", () => {
    fc.assert(fc.property(seed, (s) => {
      const r = createRandom(s);
      for (let i = 0; i < 200; i++) { const x = r.next(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    }));
  });

  it("int は両端を含む範囲の整数", () => {
    fc.assert(fc.property(seed, fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 30 }), (s, lo, w) => {
      const r = createRandom(s);
      for (let i = 0; i < 100; i++) { const x = r.int(lo, lo + w); expect(Number.isInteger(x)).toBe(true); expect(x).toBeGreaterThanOrEqual(lo); expect(x).toBeLessThanOrEqual(lo + w); }
    }));
  });

  it("回数を増やすと、平均は 1/2 に、chance(p) の割合は p に近づく（許す幅は標準誤差の5倍）", () => {
    fc.assert(fc.property(seed, fc.double({ min: 0.05, max: 0.95, noNaN: true }), (s, p) => {
      const r = createRandom(s), n = 20000;
      let sum = 0, hit = 0;
      for (let i = 0; i < n; i++) { sum += r.next(); if (r.chance(p)) hit++; }
      expect(Math.abs(sum / n - 0.5)).toBeLessThan(5 * Math.sqrt(1 / 12 / n));
      expect(Math.abs(hit / n - p)).toBeLessThan(5 * Math.sqrt(p * (1 - p) / n));
    }), { numRuns: 30 });
  });

  it("int(1, 6) の各目はおよそ 1/6（10種）", () => {
    for (let s = 1; s <= 10; s++) {
      const r = createRandom(s), n = 60000, c = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) c[r.int(1, 6) - 1]!++;
      for (const k of c) expect(Math.abs(k / n - 1 / 6)).toBeLessThan(5 * Math.sqrt((1 / 6) * (5 / 6) / n));
    }
  });

  it("fork は元の並びを固定したまま、別の並びを作る", () => {
    const a = createRandom(7), b = createRandom(7);
    const f = a.fork(); b.fork();
    expect(a.next()).toBe(b.next());
    expect(f.next()).not.toBe(createRandom(7).next());
  });

  it("種は 32 ビットの整数にそろう。おかしな値は止める", () => {
    expect(normalizeSeed(-1)).toBe(2 ** 32 - 1);
    expect(normalizeSeed(3.9)).toBe(3);
    expect(() => createRandom(Number.NaN)).toThrow();
    expect(() => createRandom(1).chance(1.5)).toThrow();
    expect(() => createRandom(1).int(3, 2)).toThrow();
  });

  it("決まった種の最初の値は変わらない（方式を変えたら、既存の実験の再現が崩れるので気づく）", () => {
    const r = createRandom(42);
    expect([r.next(), r.next(), r.next()].map((x) => x.toFixed(10))).toMatchInlineSnapshot(`
      [
        "0.6011037519",
        "0.4482905590",
        "0.8524657935",
      ]
    `);
  });
});
