// 数学的な正しさ（#109）：ランダムな同値性だけでなく、スコープ・記号と確率変数の対応・定義域・前提条件・式の中身を確かめる。
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import formulas from "./fixtures/stats2-formulas.json";
import {
  boundSymbols, checkDomain, definitionsFor, sliderRange, describeDomain, evaluate, expand, freeSymbols, inDomain, openSymbol, stopReason, toTex,
  type Definition, type Formula, type FormulaNode, type FormulaSymbol,
} from "../src";

const all = formulas as (Formula & { concept: string; index: number })[];
const find = (id: string, i: number) => all.find((f) => f.concept === id && f.index === i)!;
const rhsOf = (f: Formula) => (f.tree as { args: FormulaNode[] }).args[1]!;
const resolve = (s: FormulaSymbol) => definitionsFor(s.key, all.filter((g) => g.concept === s.concept));

// ---- 1. 変数のスコープ ----
describe("スコープ：Σ・∫ の動かす記号は外に漏れず、取り込まれない", () => {
  const S = (k: string): FormulaSymbol => ({ symbol: k, meaning: k, key: k });
  // E(X)＝Σ_x x p(x) を、外に自由な x がある式 x·E(X) の中で開く
  const eDef: Definition = { formula: find("TERM-expect", 0), side: 1 };
  it("外の x と、Σ の x がぶつからない（Σ の x を x2 に付け替える）", () => {
    const target: FormulaNode = { op: "mul", args: [{ sym: "x" }, { op: "fn", name: "E", args: [{ sym: "X" }] }] };
    const r = openSymbol(target, [S("x"), S("X"), S("E")], "E", eDef);
    expect(r.count).toBe(1);
    expect(freeSymbols(r.tree)).toEqual(new Set(["x"]));   // E の定義（Σ_x x p(x)）は X を書かないので、外の x だけが自由
    expect(boundSymbols(r.tree)).toEqual(new Set(["x2"]));
    expect(toTex(r.tree, { symbols: r.symbols })).toBe("x\\sum_{x′}x′p(x′)");
  });
  it("引数に Σ と同じ名前があっても取り込まれない：E(x) → Σ_{x2} …", () => {
    const target: FormulaNode = { op: "fn", name: "E", args: [{ sym: "x" }] };
    const r = openSymbol(target, [S("x"), S("E")], "E", eDef);
    expect(boundSymbols(r.tree).has("x")).toBe(false);
    expect(freeSymbols(r.tree).has("x")).toBe(false);   // E(X) の X は Σ の中で使われていないので、x は消える（E の定義は X を使わない）
  });
  it("性質：開いても、元の自由な記号は自由なまま（縛られない）", () => {
    const leaf = fc.constantFrom<FormulaNode>({ sym: "x" }, { sym: "y" }, { num: 2 }, { op: "fn", name: "E", args: [{ sym: "X" }] });
    const tree = fc.letrec<{ t: FormulaNode }>((tie) => ({
      t: fc.oneof({ depthSize: "small" }, leaf, fc.record({ op: fc.constantFrom("add", "mul"), args: fc.array(tie("t"), { minLength: 2, maxLength: 3 }) })) as fc.Arbitrary<FormulaNode>,
    })).t;
    fc.assert(fc.property(tree, (t) => {
      const before = freeSymbols(t);
      const r = openSymbol(t, [S("x"), S("y"), S("X"), S("E")], "E", eDef);
      const after = freeSymbols(r.tree);
      for (const k of before) if (k !== "X") expect(after.has(k)).toBe(true);
      for (const b of boundSymbols(r.tree)) expect(before.has(b)).toBe(false);
    }), { numRuns: 200 });
  });
});

// ---- 2. 記号と確率変数の対応 ----
describe("対応：開いた式に、どの確率変数にも属さない記号が残らない", () => {
  it("教材の式で開けるものをすべて開き、開いて新しくできた記号（μ_Z など）の確率変数は式の中にある", () => {
    let checked = 0;
    for (const f of all) for (const s of f.symbols) {
      if (!s.concept) continue;
      for (const d of definitionsFor(s.key, all.filter((g) => g.concept === s.concept))) {
        const r = openSymbol(f.tree, f.symbols, s.key, d, new Map(), { resolve });
        if (!r.count) continue;
        const free = freeSymbols(r.tree);
        const before = new Set([...f.symbols, ...d.formula.symbols].map((x) => x.key));
        for (const k of free) {
          const sym = r.symbols.find((x) => x.key === k);
          if (sym?.of && !before.has(k)) { expect([f.concept, k, free.has(sym.of)]).toEqual([f.concept, k, true]); checked++; }
        }
        // 開いた式に、引数が式なのに残った「元の確率変数に属する記号」がない（V(aX+b) の中の μ は E(aX+b) になっている）
        expect(toTex(r.tree, { symbols: r.symbols })).not.toMatch(/aX\+b-\\mu/);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it("μ＝E(X) で μ を開ける（標準化の式の μ）", () => {
    const z = find("TERM-std", 0);
    const mu = z.symbols.find((s) => s.key === "mu")!;
    const [d] = resolve(mu);
    expect(toTex(openSymbol(z.tree, z.symbols, "mu", d!).tree, { symbols: z.symbols })).toBe("Z=\\dfrac{X-E(X)}{\\sigma}");
  });
});

// ---- 3. 定義域 ----
describe("定義域", () => {
  const binom = find("TERM-binom", 0);
  it("定義域の外の値を知らせる：p＝1.5・k＝2.5・n＝0", () => {
    expect(new Set(checkDomain({ p: 1.5, k: 2.5, n: 0 }, binom.symbols))).toEqual(new Set([
      "k は 0以上 n 以下の整数（今 2.5、n＝0）", "n は 1以上の整数（今 0）", "p は 0以上1以下（今 1.5）",
    ]));
  });
  it("記号どうしの範囲：k ≦ n（デザイン監査の n＝5・k＝10・p＝7 は3つとも知らせる）", () => {
    expect(new Set(checkDomain({ n: 5, k: 10, p: 7 }, binom.symbols))).toEqual(new Set([
      "k は 0以上 n 以下の整数（今 10、n＝5）", "p は 0以上1以下（今 7）",
    ]));
    expect(checkDomain({ n: 5, k: 5, p: 0.5 }, binom.symbols)).toEqual([]);
    const k = binom.symbols.find((s) => s.key === "k")!;
    expect(sliderRange(k, { n: 5 }, { min: 0, max: 100, step: 0.01 })).toEqual({ min: 0, max: 5, step: 1 });   // n を動かすと k の範囲も動く
    expect(sliderRange(k, { n: 12 }, { min: 0, max: 100, step: 0.01 }).max).toBe(12);
    const lam = find("TERM-poisson", 0).symbols.find((s) => s.key === "lambda")!;
    expect(sliderRange(lam, {}, { min: 0, max: 10, step: 0.1 }).min).toBeCloseTo(0.1);   // 0より大きい
    expect(checkDomain({ p: 0.3, k: 2, n: 10 }, binom.symbols)).toEqual([]);
  });
  it("端を含まない・0でない", () => {
    expect(describeDomain({ min: 0, minOpen: true })).toBe("0より大きい");
    expect(inDomain(0, { min: 0, minOpen: true })).toBe(false);
    expect(inDomain(0, { nonzero: true })).toBe(false);
    expect(describeDomain({ min: 1, integer: true })).toBe("1以上の整数");
  });
  it("教材の式の定義域は、範囲の文（range）と食い違わない（定義域の端の値が range の文に出てくる）", () => {
    for (const f of all) for (const s of f.symbols) if (s.domain && s.range) {
      for (const v of [s.domain.min, s.domain.max]) if (v !== undefined) {
        const word = typeof v === "string" ? f.symbols.find((x) => x.key === v)!.symbol : String(v);   // 記号どうしなら相手の記号が文に出る
        expect([f.concept, s.key, s.range.includes(word)]).toEqual([f.concept, s.key, true]);
      }
    }
  });
});

// ---- 4. 前提条件：展開が止まったら理由を言う ----
describe("前提条件", () => {
  it("σ＝0 の標準化は 0 で割るので止まる", () => {
    const z = find("TERM-std", 0);
    const steps = expand(z.tree, { values: { X: 60, mu: 50, sigma: 0 } });
    expect(stopReason(steps[steps.length - 1]!)).toBe("0 で割ることになる");
  });
  it("負の分散の平方根は止まる", () => {
    const sd = find("TERM-sd", 0);
    const steps = expand(sd.tree, { values: { X: 0 }, fns: { V: () => -4 } });
    expect(stopReason(steps[steps.length - 1]!, { fns: { V: () => -4 } })).toBe("負の数の平方根になる");
  });
});

// ---- 5. 式の中身（教材の式そのものが数学的に正しいか） ----
const at = (f: Formula, values: Record<string, number>) => evaluate(rhsOf(f), { values })!;
describe("式の中身：確率の和は1・期待値と分散は定義と一致", () => {
  it("二項分布：Σ P(X＝k)＝1、Σ k P＝np、Σ (k−np)² P＝np(1−p)（定義域の中のいろいろな n・p）", () => {
    const P = find("TERM-binom", 0), E = find("TERM-binom", 1), V = find("TERM-binom", 2);
    fc.assert(fc.property(fc.integer({ min: 1, max: 40 }), fc.double({ min: 0, max: 1, noNaN: true }), (n, p) => {
      expect(checkDomain({ n, p }, P.symbols)).toEqual([]);
      let s = 0, m = 0, v = 0;
      const mu = at(E, { n, p });
      for (let k = 0; k <= n; k++) { const q = at(P, { n, p, k }); expect(q).toBeGreaterThanOrEqual(-1e-12); s += q; m += k * q; v += (k - mu) ** 2 * q; }
      expect(s).toBeCloseTo(1, 9); expect(m).toBeCloseTo(mu, 9); expect(v).toBeCloseTo(at(V, { n, p }), 9);
    }), { numRuns: 100 });
  });
  it("ポアソン分布：Σ P＝1、Σ k P＝λ（k は 0〜λ+20√λ+30 まで）", () => {
    const P = find("TERM-poisson", 0);
    fc.assert(fc.property(fc.double({ min: 0.05, max: 20, noNaN: true }), (lambda) => {
      let s = 0, m = 0;
      for (let k = 0; k <= Math.ceil(lambda + 20 * Math.sqrt(lambda) + 30); k++) { const q = at(P, { lambda, k }); s += q; m += k * q; }
      expect(s).toBeCloseTo(1, 9); expect(m).toBeCloseTo(lambda, 8);
    }), { numRuns: 60 });
  });
  it("幾何分布：Σ P＝1、平均＝1/p", () => {
    const P = find("TERM-geom", 0), E = find("TERM-geom", 1);
    fc.assert(fc.property(fc.double({ min: 0.05, max: 1, noNaN: true }), (p) => {
      let s = 0, m = 0;
      for (let k = 1; k <= 2000; k++) { const q = at(P, { p, k }); s += q; m += k * q; }
      expect(s).toBeCloseTo(1, 8); expect(m).toBeCloseTo(at(E, { p }), 6);
    }), { numRuns: 40 });
  });
  it("超幾何分布：Σ P＝1、平均＝nM/N", () => {
    const P = find("TERM-hyper", 0), E = find("TERM-hyper", 1);
    fc.assert(fc.property(fc.integer({ min: 1, max: 30 }).chain((N) => fc.tuple(fc.constant(N), fc.integer({ min: 0, max: N }), fc.integer({ min: 0, max: N }))), ([N, M, n]) => {
      let s = 0, m = 0;
      for (let k = 0; k <= n; k++) { const q = at(P, { N, M, n, k }); s += q; m += k * q; }
      expect(s).toBeCloseTo(1, 9); expect(m).toBeCloseTo(at(E, { N, M, n }), 9);
    }), { numRuns: 100 });
  });
  it("一様分布・指数分布：密度の積分は1、平均は式どおり（数値積分）", () => {
    const integrate = (g: (x: number) => number, a: number, b: number, n = 20000) => { let s = 0; const h = (b - a) / n; for (let i = 0; i < n; i++) s += g(a + (i + 0.5) * h) * h; return s; };
    const fu = find("TERM-uniform", 0), Eu = find("TERM-uniform", 1), Vu = find("TERM-uniform", 2);
    const fe = find("TERM-expo", 0), Ee = find("TERM-expo", 2);
    fc.assert(fc.property(fc.double({ min: -5, max: 5, noNaN: true }), fc.double({ min: 0.1, max: 5, noNaN: true }), (a, w) => {
      const b = a + w, f = (x: number) => at(fu, { a, b, x });
      expect(integrate(f, a, b)).toBeCloseTo(1, 6);
      const mu = integrate((x) => x * f(x), a, b);
      expect(mu).toBeCloseTo(at(Eu, { a, b }), 6);
      expect(integrate((x) => (x - mu) ** 2 * f(x), a, b)).toBeCloseTo(at(Vu, { a, b }), 6);
    }), { numRuns: 30 });
    fc.assert(fc.property(fc.double({ min: 0.2, max: 5, noNaN: true }), (lambda) => {
      const f = (x: number) => at(fe, { lambda, x }), hi = 60 / lambda;
      expect(integrate(f, 0, hi)).toBeCloseTo(1, 5);
      expect(integrate((x) => x * f(x), 0, hi)).toBeCloseTo(at(Ee, { lambda }), 4);
    }), { numRuns: 30 });
  });
});

// Σ・Π の値（階乗を ∏ で開いても値が変わらないように。#110）
describe("Σ・Π の値", () => {
  const prod: FormulaNode = { op: "prod", var: "i", lower: { num: 1 }, upper: { sym: "n" }, args: [{ sym: "i" }] };
  const sum: FormulaNode = { op: "sum", var: "i", lower: { num: 1 }, upper: { sym: "n" }, args: [{ sym: "i" }] };
  it("∏_{i=1}^{n} i は n!、Σ_{i=1}^{n} i は n(n+1)/2（空の積は1、空の和は0）", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 15 }), (n) => {
      let f = 1; for (let i = 2; i <= n; i++) f *= i;
      expect(evaluate(prod, { values: { n } })).toBe(f);
      expect(evaluate(sum, { values: { n } })).toBe((n * (n + 1)) / 2);
    }));
  });
  it("動かす記号の外の値は中に漏れない（i に外の値があっても、中では 1〜n を動く）", () => {
    expect(evaluate(prod, { values: { n: 4, i: 100 } })).toBe(24);
  });
  it("端が整数でない・項が多すぎるときは値にしない", () => {
    expect(evaluate(prod, { values: { n: 2.5 } })).toBeUndefined();
    expect(evaluate(sum, { values: { n: 1e6 } })).toBeUndefined();
  });
  it("1段ずつの展開で、端が数になった ∏ は1段で値になる", () => {
    const steps = expand(prod, { values: { n: 5 } });
    expect(steps.map((s) => ("num" in s ? s.num : "式"))).toEqual(["式", "式", 120]);
  });
});

describe("Σ・Π の端も1段ずつ", () => {
  it("∏_{i=1}^{n−k} i は端を 7 にしてから値になる", () => {
    const t: FormulaNode = { op: "prod", var: "i", lower: { num: 1 }, upper: { op: "sub", args: [{ sym: "n" }, { sym: "k" }] }, args: [{ sym: "i" }] };
    const steps = expand(t, { values: { n: 10, k: 3 } });
    expect("num" in steps[steps.length - 1]! && (steps[steps.length - 1] as { num: number }).num).toBe(5040);
  });
});

it("Σ・Π のあとに掛けるものが続くと括弧で包む（∏k i ∏m i を1つの積と読み違えない）", () => {
  const p = (u: string): FormulaNode => ({ op: "prod", var: "i", lower: { num: 1 }, upper: { sym: u }, args: [{ sym: "i" }] });
  const t = toTex({ op: "mul", args: [p("k"), p("m")] });
  expect(t).toBe("\\left(\\prod_{i=1}^{k}i\\right)\\prod_{i=1}^{m}i");
});

// 端のない Σ_x（値の表の分布。#119）：x がとる値の一覧（domains）と p(x)（fns）から計算し、1段で項に開く
describe("値の表の Σ", () => {
  const ex = find("TERM-expect", 0);   // E(X)＝Σ_x x p(x)
  const table = fc.array(fc.tuple(fc.integer({ min: -20, max: 50 }), fc.integer({ min: 0, max: 9 })), { minLength: 1, maxLength: 8 })
    .map((rows) => { const m = new Map<number, number>(); for (const [x, w] of rows) m.set(x, (m.get(x) ?? 0) + w); return [...m]; })
    .filter((rows) => rows.some(([, w]) => w > 0));
  it("性質：どの表でも、値は定義（値×確率の和）と同じ。展開は項に開いてから同じ値で終わる", () => {
    fc.assert(fc.property(table, (rows) => {
      const tot = rows.reduce((s, [, w]) => s + w, 0), xs = rows.map(([x]) => x), pr = new Map(rows.map(([x, w]) => [x, w / tot]));
      const env = { domains: { x: xs }, fns: { p: (x: number) => pr.get(x) ?? 0 } };
      const want = rows.reduce((s, [x, w]) => s + x * (w / tot), 0);
      const rhs = (ex.tree as { args: FormulaNode[] }).args[1]!;
      expect(evaluate(rhs, env)).toBeCloseTo(want, 9);
      const steps = expand(ex.tree, env);
      const opened = steps[1] as { op?: string; args?: unknown[] };
      if (xs.length > 1) expect(opened.op === "add" && opened.args!.length === xs.length).toBe(true);
      const last = steps[steps.length - 1]!;
      expect("num" in last && Math.abs((last as { num: number }).num - want) < 1e-9).toBe(true);
    }), { numRuns: 60 });
  });
  it("値の一覧がなければ計算しない（Σ_x の x がとる値がわからない）", () => {
    expect(evaluate((ex.tree as { args: FormulaNode[] }).args[1]!, { fns: { p: () => 0.5 } })).toBeUndefined();
  });
  it("内側で同じ記号を縛る Σ には入れない", () => {
    const t: FormulaNode = { op: "sum", var: "x", args: [{ op: "sum", var: "x", lower: { num: 1 }, upper: { num: 2 }, args: [{ sym: "x" }] }] };
    expect(evaluate(t, { domains: { x: [10, 20] } })).toBe(6);   // 外の x は使われず、内側の 1＋2 を2回
  });
});
