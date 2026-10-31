// 独立な見本と照らす（stats2-course #118 単位 B）。見本（fixtures/stats2-reference.json）は教材の build/oracle.py が、
// engine とも教材の式とも別に（並びの数え上げ・値の表の和・Fraction）求めた値。式（fixtures/stats2-formulas.json）は教材の原本の木。
// どちらも写しで、scripts/sync-stats2.mjs が版を固定した元と同じかを確かめる（C5）。
//
// 独立性（#118 の原則 3）：期待値は見本、実際の値は教材の式の木を engine の evaluate で計算したもの。同じ式・同じ写しから両方を作らない。
// 誤差の決まりは見本の tolerance（exact：相対 1e−12・絶対 1e−15、derived：1e−12）。テストを通すために広げない。
import { describe, expect, it } from "vitest";
import formulas from "./fixtures/stats2-formulas.json";
import reference from "./fixtures/stats2-reference.json";
import { checkDomain, evaluate, type Formula, type FormulaCondition, type FormulaNode, type FormulaSymbol } from "../src";

type F = Formula & { id: string; concept: string; defined_in?: string; contract: { conditions?: FormulaCondition[]; representative?: boolean } };
const all = formulas as unknown as F[];
const byId = (id: string) => all.find((f) => f.id === id && !f.defined_in)!;
const rhs = (f: { tree: FormulaNode }) => { const a = (f.tree as { args: FormulaNode[] }).args; return a[a.length - 1]!; };
type Num = { exact?: string; float: number };
const TOL = { exact: { rel: 1e-12, abs: 1e-15 }, derived: { rel: 1e-12, abs: 1e-12 } } as const;
const near = (got: number | undefined, want: Num, kind: keyof typeof TOL = "exact") =>
  got !== undefined && Math.abs(got - want.float) <= Math.max(TOL[kind].abs, TOL[kind].rel * Math.abs(want.float));

type BinomCase = { id: string; inputs: { n: number; p: Num }; values: { pmf: Num[]; mean_by_definition: Num; var_by_definition: Num } };
type TableCase = {
  id: string; inputs: { rows: { x: number; weight: number }[] };
  values: { mu: Num; var_by_definition: Num; linear: { a: Num; b: Num; E_by_table: Num; V_by_table: Num; mutants: Record<string, Num> }[];
    standardize: { sigma: Num; z: { x: Num; z: Num }[] } };
};
const cases = reference.cases as unknown[];
const binom = cases.filter((c) => (c as { id: string }).id.startsWith("binom-")) as BinomCase[];
const tables = cases.filter((c) => (c as { id: string }).id.startsWith("table-")) as TableCase[];

/** 式（の木）を見本と照らし、食い違った所を返す。テストはこれが空であることを見る。わざと誤りを入れた木にも同じ関数を使う（検出能力の実証） */
function binomMismatches(pmf: FormulaNode, mean: FormulaNode, variance: FormulaNode): string[] {
  const bad: string[] = [];
  for (const c of binom) {
    const { n } = c.inputs, p = c.inputs.p.float;
    c.values.pmf.forEach((want, k) => { if (!near(evaluate(pmf, { values: { n, k, p } }), want)) bad.push(`${c.id} P(X=${k})`); });
    if (!near(evaluate(mean, { values: { n, p } }), c.values.mean_by_definition)) bad.push(`${c.id} E`);
    if (!near(evaluate(variance, { values: { n, p } }), c.values.var_by_definition)) bad.push(`${c.id} V`);
  }
  return bad;
}
function linearMismatches(eLin: FormulaNode, vLin: FormulaNode): string[] {
  const bad: string[] = [];
  for (const c of tables) for (const l of c.values.linear) {
    const values = { a: l.a.float, b: l.b.float, X: Number.NaN };   // X は関数の引数として置くだけ（値は fns が表から返す）
    // E(X)・V(X) は表で決まる数。式の右辺 aE(X)+b・a²V(X) に、その数を関数として渡す（式の形を確かめる。分布の計算は見本の側）
    const fns = { E: () => c.values.mu.float, V: () => c.values.var_by_definition.float };
    if (!near(evaluate(eLin, { values, fns }), l.E_by_table)) bad.push(`${c.id} a=${l.a.float} E`);
    if (!near(evaluate(vLin, { values, fns }), l.V_by_table)) bad.push(`${c.id} a=${l.a.float} V`);
  }
  return bad;
}
/** 木の中の節を1つ置き換えた木（わざと入れる誤り） */
const mutate = (t: FormulaNode, find: (n: FormulaNode) => boolean, to: FormulaNode): FormulaNode => {
  if (find(t)) return to;
  if ("args" in t) return { ...t, args: t.args.map((a) => mutate(a, find, to)) };
  return t;
};
const same = (a: FormulaNode) => (b: FormulaNode) => JSON.stringify(a) === JSON.stringify(b);

// 確かめる対象：二項分布の3式（確率・期待値・分散）の値。想定する故障：指数・係数の誤り、確率と np の式が「同じ誤りを共有」して
// 性質のテスト（Σ P＝1・Σ kP＝np）が通ってしまう場合。見つけ方：並びの数え上げで求めた見本（端 p＝0・1、n＝1 を含む10組）と照らす。
// 既存との違い：correctness.test.ts の性質のテストは期待値も同じ式から作る。ここは独立な見本
describe("二項分布：教材の式は、並びの数え上げの見本と一致する", () => {
  const [pmf, mean, variance] = ["F-binom-pmf", "F-binom-mean", "F-binom-var"].map((id) => rhs(byId(id)));
  it("確率・期待値・分散が全部の見本で一致する（端の p＝0・1 を含む）", () => {
    expect(binom.length).toBeGreaterThanOrEqual(10);
    expect(binomMismatches(pmf!, mean!, variance!)).toEqual([]);
  });
  it("わざと入れた誤りは見本で見つかる：(1−p) の指数を n−k+1 に（M5）・np(1−p) を np(1+p) に", () => {
    const exp = { op: "sub", args: [{ sym: "n" }, { sym: "k" }] } as FormulaNode;
    const m5 = mutate(pmf!, same(exp), { op: "add", args: [exp, { num: 1 }] });
    expect(binomMismatches(m5, mean!, variance!).length).toBeGreaterThan(0);
    const oneMinus = { op: "sub", args: [{ num: 1 }, { sym: "p" }] } as FormulaNode;
    const v = mutate(variance!, same(oneMinus), { op: "add", args: [{ num: 1 }, { sym: "p" }] });
    expect(binomMismatches(pmf!, mean!, v).length).toBeGreaterThan(0);
  });
});

// 確かめる対象：E(aX+b)＝aE(X)+b と V(aX+b)＝a²V(X) の右辺。想定する故障：b を落とす・2乗落ち（M6）・b を残す。
// 見つけ方：見本は値の表を aX+b に置き換えた別の表の平均・分散（式を使わない。a＝0・負・分数を含む）。
// 既存との違い：今までは V(aX+b) を開いた形の TeX（文字列）だけを見ていて、値では確かめていなかった
describe("1次変換：E(aX+b)・V(aX+b) の式は、置き換えた表の見本と一致する", () => {
  const eLin = rhs(byId("F-expect-linear")), vLin = rhs(byId("F-var-linear"));
  it("全部の表・全部の (a, b) で一致する", () => {
    expect(tables.length).toBeGreaterThanOrEqual(3);
    expect(linearMismatches(eLin, vLin)).toEqual([]);
  });
  it("わざと入れた誤り（a² を a に：M6）は見本で見つかる", () => {
    const a2 = { op: "pow", args: [{ sym: "a" }, { num: 2 }] } as FormulaNode;
    const m6 = mutate(vLin, same(a2), { sym: "a" });
    expect(JSON.stringify(m6)).not.toBe(JSON.stringify(vLin));
    expect(linearMismatches(eLin, m6).length).toBeGreaterThan(0);
  });
});

// 確かめる対象：標準化 Z＝(X−μ)/σ の値。想定する故障：分子・分母の取り違え。見つけ方：表ごとの見本の z（σ は √ を通すので derived の幅）
describe("標準化：教材の式は見本の z と一致する", () => {
  it("全部の表・全部の値で一致する", () => {
    const f = rhs(byId("F-std-def"));
    const bad: string[] = [];
    for (const c of tables) for (const { x, z } of c.values.standardize.z)
      if (!near(evaluate(f, { values: { X: x.float, mu: c.values.mu.float, sigma: c.values.standardize.sigma.float } }), z, "derived")) bad.push(`${c.id} x=${x.float}`);
    expect(bad).toEqual([]);
  });
});

// 確かめる対象：前提が崩れた入力で計算しないこと（定義域と記号どうしの条件）。想定する故障：σ＝0 を許す（M4：domain の minOpen を消す）・
// 幾何の p＝0・一様の a＝b（#118 D5 で直した所）・超幾何の k＞M など1つの端で書けない条件（契約の conditions）を見落とす。
// 見つけ方：見本の preconditions の入力を、その式の記号の domain と契約の conditions で checkDomain に通し、止まる理由が出るか。
// 既存との違い：correctness.test.ts の「σ＝0 は 0 で割るので止まる」は stopReason だけで、domain を消しても通っていた
describe("前提の崩れ：見本の入力は、式の定義域か記号どうしの条件で止まる", () => {
  type Pre = { id: string; formula_ids: string[]; inputs: Record<string, unknown> };
  const pres = (reference.preconditions as Pre[]).filter((p) => p.formula_ids.length);
  const valuesOf = (p: Pre): Record<string, number> => {
    if (p.id === "std-sigma-zero") { const x = (p.inputs.rows as { x: number }[])[0]!.x; return { X: x, mu: x, sigma: 0 }; }   // 1点の表：μ＝x・σ＝0
    return p.inputs as Record<string, number>;
  };
  const stops = (f: F, values: Record<string, number>, symbols: FormulaSymbol[] = f.symbols) => checkDomain(values, symbols, f.contract.conditions ?? []);
  it("全部の崩れた入力で、関係する式のどれもが止まる理由を言う", () => {
    expect(pres.map((p) => p.id)).toEqual(expect.arrayContaining(["std-sigma-zero", "geom-p-zero", "uniform-a-eq-b", "hyper-k-over-M", "hyper-k-too-small"]));
    const silent = pres.flatMap((p) => p.formula_ids.filter((id) => stops(byId(id), valuesOf(p)).length === 0).map((id) => `${p.id}：${id}`));
    expect(silent).toEqual([]);
  });
  it("定義域の中の入力では止まらない（止まりすぎない）", () => {
    expect(stops(byId("F-hyper-pmf"), { N: 10, M: 3, n: 5, k: 2 })).toEqual([]);
    expect(stops(byId("F-geom-pmf"), { k: 1, p: 0.5 })).toEqual([]);
    expect(stops(byId("F-std-def"), { X: 4, mu: 3, sigma: 2 })).toEqual([]);
  });
  it("わざと入れた誤り（σ の domain の minOpen を消す：M4）は見つかる", () => {
    const f = byId("F-std-def");
    const m4 = f.symbols.map((s) => (s.key === "sigma" && s.domain ? { ...s, domain: { ...s.domain, minOpen: false } } : s));
    expect(stops(f, { X: 4, mu: 4, sigma: 0 }, m4)).toEqual([]);
  });
});
