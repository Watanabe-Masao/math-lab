// 意味のかたまりと分布（#110）：かたまりは木の節を指し、かたまりの値の積が式の値、分布の和は1
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import formulas from "./fixtures/stats2-formulas.json";
import { distribution, evaluate, nodeAt, rhsOf, toTex, type Formula } from "../src";

const binom = (formulas as (Formula & { concept: string; index: number })[]).find((f) => f.concept === "TERM-binom" && f.index === 0)!;

describe("意味のかたまり", () => {
  it("二項分布の3つのかたまりは ₙCₖ・pᵏ・(1−p)ⁿ⁻ᵏ", () => {
    expect(binom.parts!.map((p) => toTex(nodeAt(binom.tree, p.path)!, { symbols: binom.symbols }))).toEqual(["{}_{n}\\mathrm{C}_{k}", "p^{k}", "(1-p)^{n-k}"]);
  });
  it("性質：かたまりの値の積が式の値（どの n・k・p でも）", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }).chain((n) => fc.tuple(fc.constant(n), fc.integer({ min: 0, max: n }))), fc.double({ min: 0, max: 1, noNaN: true }), ([n, k], p) => {
      const values = { n, k, p };
      const prod = binom.parts!.reduce((a, part) => a * evaluate(nodeAt(binom.tree, part.path)!, { values })!, 1);
      expect(prod).toBeCloseTo(evaluate(rhsOf(binom.tree), { values })!, 12);
    }), { numRuns: 200 });
  });
  it("分布：k を 0〜n で動かした値の和は1", () => {
    const d = distribution(binom.tree, "k", 0, 10, { values: { n: 10, p: 0.3 } });
    expect(d.length).toBe(11);
    expect(d.reduce((s, x) => s + (x.y ?? 0), 0)).toBeCloseTo(1, 12);
  });
  it("木にない節を指す path は undefined", () => {
    expect(nodeAt(binom.tree, [1, 9])).toBeUndefined();
    expect(nodeAt(binom.tree, [0, 0, 0, 0])).toBeUndefined();
  });
});
