// 式の木：教材の35式が検査を通り、TeX になり、KaTeX で読める。括弧は値を変えない（性質）。1段ずつの展開の最後は値と同じ。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import formulas from "./fixtures/stats2-formulas.json";
import { evaluate, expand, symbolsIn, toTex, validateFormula, type Formula, type FormulaNode } from "../src";

const all = formulas as (Formula & { concept: string; index: number })[];
const parses = (tex: string, trust = false) => katex.renderToString(tex, { throwOnError: true, trust, strict: false });
const find = (id: string, i: number) => all.find((f) => f.concept === id && f.index === i)!;

describe("教材の式（stats2-course の35式）", () => {
  it("検査を通る", () => {
    for (const f of all) expect([f.concept, validateFormula(f)]).toEqual([f.concept, []]);
  });
  it("木から作った TeX は KaTeX で読める（記号に印を付けても）", () => {
    for (const f of all) {
      expect(() => parses(toTex(f.tree, { symbols: f.symbols }))).not.toThrow();
      expect(() => parses(toTex(f.tree, { symbols: f.symbols, wrap: (k, t) => `\\htmlData{sym=${k}}{${t}}` }), true)).not.toThrow();
    }
  });
  it("代表の式の形", () => {
    const t = (id: string, i: number) => toTex(find(id, i).tree, { symbols: find(id, i).symbols });
    expect(t("TERM-std", 0)).toBe("Z=\\dfrac{X-\\mu}{\\sigma}");
    expect(t("TERM-binom", 1)).toBe("E(X)=np");
    expect(t("TERM-binom", 2)).toBe("V(X)=np(1-p)");
    expect(t("TERM-binom", 0)).toBe("P(X=k)={}_{n}\\mathrm{C}_{k}p^{k}(1-p)^{n-k}");
    expect(t("TERM-uniform", 2)).toBe("V(X)=\\dfrac{(b-a)^{2}}{12}");
    expect(t("TERM-expo", 1)).toBe("P(X>x)=e^{-\\lambda x}");
    expect(t("TERM-cov", 1)).toBe("V(X+Y)=V(X)+V(Y)+2\\mathrm{Cov}(X,\\,Y)");
  });
});

describe("1段ずつ展開する", () => {
  const tex = (n: FormulaNode) => toTex(n);
  it("E(X)＝np（n＝10・p＝0.3）：np → 10×0.3 → 3", () => {
    expect(expand(find("TERM-binom", 1).tree, { values: { n: 10, p: 0.3 } }).map(tex)).toEqual(["np", "10\\times 0.3", "3"]);
  });
  it("V(X)＝np(1−p)：内側から1段ずつ", () => {
    expect(expand(find("TERM-binom", 2).tree, { values: { n: 10, p: 0.3 } }).map(tex)).toEqual([
      "np(1-p)", "10\\times 0.3\\times (1-0.3)", "10\\times 0.3\\times 0.7", "2.1",
    ]);
  });
  it("ポアソン P(X＝2)（λ＝3）の最後の値は e⁻³3²/2!", () => {
    const steps = expand(find("TERM-poisson", 0).tree, { values: { lambda: 3, k: 2 } });
    const last = steps[steps.length - 1]!;
    expect("num" in last && last.num).toBeCloseTo(Math.exp(-3) * 9 / 2, 12);
  });
  it("値のない記号は残す（E・V などの関数は、中身を渡したときだけ計算する）", () => {
    const steps = expand(find("TERM-std", 0).tree, { values: { mu: 50, sigma: 10 } });
    expect(tex(steps[steps.length - 1]!)).toBe("\\dfrac{X-50}{10}");
    const v = expand(find("TERM-sd", 0).tree, { fns: { V: () => 4 }, values: { X: 0 } });
    expect(tex(v[v.length - 1]!)).toBe("2");
  });
  it("記号の一覧（出てくる順・重なりなし）", () => {
    expect(symbolsIn(find("TERM-binom", 0).tree)).toEqual(["X", "k", "n", "p"]);
  });
});

// ---- 性質：括弧の付け方は値を変えない ----
// 木を TeX にし、その TeX を小さな読み手で数に戻す。木の値と同じなら、括弧が足りない・余計な所で式が変わっていない。
function readTex(src: string, vals: Record<string, number>): number {
  let i = 0;
  const peek = (s: string) => src.startsWith(s, i);
  const eat = (s: string) => { if (!peek(s)) throw new Error(`「${s}」がない：${src.slice(i)}`); i += s.length; };
  const group = () => { eat("{"); const v = expr(); eat("}"); return v; };
  const atom = (): number => {
    if (peek("\\dfrac")) { i += 6; const a = group(); return a / group(); }
    if (peek("\\sqrt")) { i += 5; return Math.sqrt(group()); }
    if (peek("\\left(")) { i += 6; const v = expr(); eat("\\right)"); return v; }
    if (peek("(")) { i += 1; const v = expr(); eat(")"); return v; }
    if (peek("\\left|")) { i += 6; const v = expr(); eat("\\right|"); return Math.abs(v); }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (m) { i += m[0].length; return Number(m[0]); }
    const c = src[i]!;
    if (c in vals) { i++; return vals[c]!; }
    throw new Error(`読めない：${src.slice(i)}`);
  };
  const power = (): number => { const b = atom(); if (peek("^")) { i++; return b ** group(); } return b; };
  const unary = (): number => (peek("-") ? (i++, -unary()) : power());
  const starts = () => i < src.length && !peek("+") && !peek("-") && !peek("}") && !peek(")") && !peek("\\right");
  const term = (): number => {
    let v = unary();
    for (;;) {
      if (peek("\\times ")) { i += 7; v *= unary(); continue; }
      if (starts()) { v *= unary(); continue; }
      return v;
    }
  };
  const expr = (): number => {
    let v = term();
    for (;;) {
      if (peek("+")) { i++; v += term(); } else if (peek("-")) { i++; v -= term(); } else return v;
    }
  };
  const v = expr();
  if (i !== src.length) throw new Error(`残り：${src.slice(i)}`);
  return v;
}

const leaf: fc.Arbitrary<FormulaNode> = fc.oneof(
  fc.integer({ min: 0, max: 9 }).map((n) => ({ num: n })),
  fc.constantFrom(0.5, 1.5, 2.25).map((n) => ({ num: n })),
  fc.integer({ min: -9, max: -1 }).map((n) => ({ num: n })),
  fc.constantFrom("a", "b", "c").map((s) => ({ sym: s })),
);
const tree: fc.Arbitrary<FormulaNode> = fc.letrec<{ t: FormulaNode }>((tie) => ({
  t: fc.oneof({ depthSize: "small", withCrossShrink: true },
    leaf,
    fc.record({ op: fc.constantFrom("add", "sub", "mul"), args: fc.array(tie("t"), { minLength: 2, maxLength: 3 }) }),
    fc.record({ op: fc.constant("div"), args: fc.tuple(tie("t"), tie("t")) }),
    fc.record({ op: fc.constant("pow"), args: fc.tuple(tie("t"), fc.integer({ min: -2, max: 3 }).map((n) => ({ num: n }))) }),
    fc.record({ op: fc.constantFrom("neg", "sqrt", "abs"), args: fc.tuple(tie("t")) }),
  ) as fc.Arbitrary<FormulaNode>,
})).t;
const vals = { a: 1.25, b: -2, c: 3 };
const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));

describe("性質", () => {
  it("TeX を読み戻した値は、木の値と同じ（括弧が正しい）", () => {
    fc.assert(fc.property(tree, (t) => {
      const v = evaluate(t, { values: vals });
      fc.pre(v !== undefined && Number.isFinite(v) && Math.abs(v) < 1e6 && Math.abs(v) > 1e-6);
      const tex = toTex(t);
      expect([tex, close(readTex(tex, vals), v!)]).toEqual([tex, true]);
    }), { numRuns: 400 });
  });
  it("展開の最後は値と同じで、段ごとに式は小さくなる", () => {
    // 途中の値もすべて有限な木だけ（0 で割る途中を含む木は、展開を途中で止めるのが正しい）
    const finite = (n: FormulaNode): boolean => { const v = evaluate(n, { values: vals }); return v !== undefined && Number.isFinite(v) && (!("op" in n) || n.args.every(finite)); };
    fc.assert(fc.property(tree, (t) => {
      fc.pre(finite(t));
      const v = evaluate(t, { values: vals });
      const steps = expand(t, { values: vals });
      const last = steps[steps.length - 1]!;
      expect("num" in last && close(last.num, v!)).toBe(true);
      const size = (n: FormulaNode): number => ("op" in n ? 1 + n.args.reduce((s, a) => s + size(a), 0) : 1);
      for (let k = 2; k < steps.length; k++) expect(size(steps[k]!)).toBeLessThan(size(steps[k - 1]!));
    }), { numRuns: 300 });
  });
});
