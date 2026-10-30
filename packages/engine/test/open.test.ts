// 記号を開く・閉じる：定義に置き換える・関数は引数を結び付ける・開けないものは開かない・閉じれば戻る・開いても値は変わらない（性質）
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import formulas from "./fixtures/stats2-formulas.json";
import { applyOpens, definitionsFor, evaluate, openSymbol, toTex, type Formula, type FormulaNode } from "../src";

const all = formulas as (Formula & { concept: string; index: number })[];
const of = (id: string) => all.filter((f) => f.concept === id);
const find = (id: string, i: number) => all.find((f) => f.concept === id && f.index === i)!;
const tex = (o: { tree: FormulaNode; symbols: Formula["symbols"] }) => toTex(o.tree, { symbols: o.symbols });

describe("記号を開く", () => {
  const z = find("TERM-std", 0);
  it("σ を標準偏差の定義で開き、V を分散の定義で開く", () => {
    const [sd] = definitionsFor("sigma", of("TERM-sd"));
    const a = openSymbol(z.tree, z.symbols, "sigma", sd!);
    expect(a.count).toBe(1);
    expect(tex(a)).toBe("Z=\\dfrac{X-\\mu}{\\sqrt{V(X)}}");
    const defs = definitionsFor("V", of("TERM-var"));
    expect(defs.length).toBe(2);   // V(X)＝E((X−μ)²)＝E(X²)−E(X)² の2つの形（V(aX+b) は引数が式なので候補にしない）
    const b = openSymbol(a.tree, a.symbols, "V", defs[0]!, a.marks);
    expect(tex(b)).toBe("Z=\\dfrac{X-\\mu}{\\sqrt{E((X-\\mu)^{2})}}");
    expect(tex(openSymbol(a.tree, a.symbols, "V", defs[1]!))).toBe("Z=\\dfrac{X-\\mu}{\\sqrt{E(X^{2})-(E(X))^{2}}}");
    expect(b.symbols.map((s) => s.key)).toContain("E");   // 開いた式の記号（E）を足す
  });
  it("開いた所に印が付く（画面で淡く光らせる）", () => {
    const [sd] = definitionsFor("sigma", of("TERM-sd"));
    const a = openSymbol(z.tree, z.symbols, "sigma", sd!);
    expect(toTex(a.tree, { symbols: a.symbols, mark: (n) => a.marks.get(n) })).toContain("\\htmlData{open=sigma}{\\sqrt{V(X)}}");
  });
  it("関数は引数を結び付ける：V(Z) → E((Z−μ)²)", () => {
    const vz = find("TERM-std", 2);
    const r = openSymbol(vz.tree, vz.symbols, "V", definitionsFor("V", of("TERM-var"))[0]!);
    expect(tex(r)).toBe("V(Z)=1".replace("V(Z)", "E((Z-\\mu)^{2})"));
  });
  it("引数が式の関数は開かない（V(aX+b) の中の μ の意味が変わるため）", () => {
    const f = find("TERM-var", 1);
    const r = openSymbol(f.tree, f.symbols, "V", definitionsFor("V", of("TERM-var"))[0]!);
    expect(r.count).toBe(1);   // 右辺の V(X) だけ開く
    expect(tex(r)).toBe("V(aX+b)=a^{2}E((X-\\mu)^{2})");
  });
  it("閉じる＝手順から外して当て直す", () => {
    const sd = definitionsFor("sigma", of("TERM-sd"))[0]!, v = definitionsFor("V", of("TERM-var"))[0]!;
    const both = applyOpens(z, [{ key: "sigma", def: sd }, { key: "V", def: v }]);
    expect(both.count).toBe(2);
    expect(tex(applyOpens(z, [{ key: "sigma", def: sd }]))).toBe("Z=\\dfrac{X-\\mu}{\\sqrt{V(X)}}");
    expect(tex(applyOpens(z, []))).toBe(tex(z));
  });
  it("教材の35式で、概念を指す記号のうち開けるものはすべて開け、TeX にできる", () => {
    let opened = 0;
    for (const f of all) for (const s of f.symbols) {
      if (!s.concept) continue;
      const target = all.filter((g) => `${g.concept}` === s.concept);
      for (const d of definitionsFor(s.key, target)) {
        const r = openSymbol(f.tree, f.symbols, s.key, d);
        if (r.count) { opened++; expect(() => toTex(r.tree, { symbols: r.symbols })).not.toThrow(); }
      }
    }
    expect(opened).toBeGreaterThan(20);
  });
});

// 性質：a＝（b と c の式）で a を開いても、a にその値を入れた式と同じ値になる
const leaf: fc.Arbitrary<FormulaNode> = fc.oneof(fc.integer({ min: 1, max: 9 }).map((n) => ({ num: n })), fc.constantFrom("b", "c").map((s) => ({ sym: s })));
const expr = (withA: boolean): fc.Arbitrary<FormulaNode> => fc.letrec<{ t: FormulaNode }>((tie) => ({
  t: fc.oneof({ depthSize: "small" }, withA ? fc.oneof(leaf, fc.constant({ sym: "a" })) : leaf,
    fc.record({ op: fc.constantFrom("add", "sub", "mul"), args: fc.array(tie("t"), { minLength: 2, maxLength: 3 }) }),
    fc.record({ op: fc.constant("div"), args: fc.tuple(tie("t"), tie("t")) }),
    fc.record({ op: fc.constantFrom("neg", "sqrt"), args: fc.tuple(tie("t")) })) as fc.Arbitrary<FormulaNode>,
})).t;

describe("性質", () => {
  it("開いても値は変わらない", () => {
    fc.assert(fc.property(expr(true), expr(false), (body, def) => {
      const vals = { b: 2.5, c: 4 };
      const a = evaluate(def, { values: vals });
      fc.pre(a !== undefined && Number.isFinite(a));
      const before = evaluate(body, { values: { ...vals, a } });
      fc.pre(before !== undefined && Number.isFinite(before));
      const sym = [{ symbol: "a", meaning: "a", key: "a" }, { symbol: "b", meaning: "b", key: "b" }, { symbol: "c", meaning: "c", key: "c" }];
      const d = { formula: { symbols: sym, tree: { op: "eq", args: [{ sym: "a" }, def] } as FormulaNode }, side: 1 };
      const r = openSymbol(body, sym, "a", d);
      const after = evaluate(r.tree, { values: vals });
      expect(after).toBeCloseTo(before!, 9);
    }), { numRuns: 300 });
  });
});
