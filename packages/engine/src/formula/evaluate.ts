// 式の木の値を求める・1段ずつ展開する（#72）。
// 「確かめる」の段で、記号に今の実験の値を入れ、E(X)＝np → 10×0.3 → 3 のように、どの段で何をしたかを見せる。
import { isNum, isOp, isSym, type FormulaNode, type OpNode } from "./types";

/** 記号の値（数）と、関数の中身（E・V など、その場で決める関数）。e・π は入れなくても使える */
export type Env = { values?: Record<string, number>; fns?: Record<string, (...args: number[]) => number> };

const CONST: Record<string, number> = { e: Math.E, pi: Math.PI };

export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) return Number.NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function comb(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) return Number.NaN;
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}

const BUILTIN: Record<string, (...a: number[]) => number> = {
  comb, fact: factorial, exp: Math.exp, log: Math.log,
};

/** 1つの演算を、引数の値から計算する（計算できなければ undefined） */
function apply(n: OpNode, v: number[], env: Env): number | undefined {
  switch (n.op) {
    case "add": return v.reduce((s, x) => s + x, 0);
    case "sub": return v.slice(1).reduce((s, x) => s - x, v[0]!);
    case "mul": return v.reduce((s, x) => s * x, 1);
    case "div": return v[0]! / v[1]!;
    case "pow": return v[0]! ** v[1]!;
    case "neg": return -v[0]!;
    case "sqrt": return Math.sqrt(v[0]!);
    case "abs": return Math.abs(v[0]!);
    case "fn": { const f = env.fns?.[n.name ?? ""] ?? BUILTIN[n.name ?? ""]; return f ? f(...v) : undefined; }
    default: return undefined;   // eq・sum・prod・int は値にしない（式の形のまま）
  }
}

function symValue(k: string, env: Env): number | undefined {
  return env.values?.[k] ?? CONST[k];
}

/** Σ・Π の項の数の上限（これを超えるときは値にしない） */
const MAX_TERMS = 10000;

/** Σ・Π：下端・上端が整数の値になれば、動かす記号に1つずつ入れて足す・掛ける（空なら 0・1）。∫ は値にしない */
function bigOp(node: OpNode, env: Env): number | undefined {
  if ((node.op !== "sum" && node.op !== "prod") || !node.var || !node.lower || !node.upper) return undefined;
  const lo = evaluate(node.lower, env), hi = evaluate(node.upper, env);
  if (lo === undefined || hi === undefined || !Number.isInteger(lo) || !Number.isInteger(hi) || hi - lo + 1 > MAX_TERMS) return undefined;
  let r = node.op === "sum" ? 0 : 1;
  for (let i = lo; i <= hi; i++) {
    const x = evaluate(node.args[0]!, { ...env, values: { ...env.values, [node.var]: i } });
    if (x === undefined) return undefined;
    r = node.op === "sum" ? r + x : r * x;
  }
  return r;
}

/** 値を求める（記号の値・関数がそろわない、または eq・∫ を含むときは undefined。Σ・Π は範囲が決まれば求める） */
export function evaluate(node: FormulaNode, env: Env = {}): number | undefined {
  if (isNum(node)) return node.num;
  if (isSym(node)) return symValue(node.sym, env);
  if (node.op === "sum" || node.op === "prod") return bigOp(node, env);
  const v: number[] = [];
  for (const a of node.args) { const x = evaluate(a, env); if (x === undefined) return undefined; v.push(x); }
  return apply(node, v, env);
}

/** 記号に値を入れた木（値のない記号はそのまま。e・π は記号のまま残す） */
export function substitute(node: FormulaNode, env: Env): FormulaNode {
  if (isSym(node)) { const x = env.values?.[node.sym]; return x === undefined ? node : { num: x }; }
  if (isNum(node)) return node;
  const out: OpNode = { ...node, args: node.args.map((a) => substitute(a, env)) };
  if (node.lower) out.lower = substitute(node.lower, env);
  if (node.upper) out.upper = substitute(node.upper, env);
  return out;
}

/** 引数がすべて数になった演算を、1段だけ計算する（同じ深さのものはいっしょに）。変わらなければ同じ木を返す */
function stepOnce(node: FormulaNode, env: Env): FormulaNode {
  if (!isOp(node)) return node;
  // Σ・Π は、端が数になっていれば1段で値にする（中の動かす記号は外から入れない）
  if ((node.op === "sum" || node.op === "prod") && node.lower && node.upper && isNum(node.lower) && isNum(node.upper)) {
    const r = bigOp(node, { fns: env.fns });
    if (r !== undefined && Number.isFinite(r)) return { num: r };
  }
  const ready = node.args.every((a) => isNum(a) || (isSym(a) && CONST[a.sym] !== undefined && node.op !== "eq"));
  if (ready && node.op !== "eq") {
    const v = node.args.map((a) => (isNum(a) ? a.num : CONST[(a as { sym: string }).sym]!));
    const r = apply(node, v, env);
    if (r !== undefined && Number.isFinite(r)) return { num: r };
  }
  const args = node.args.map((a) => stepOnce(a, env));
  // Σ・Π の端（10−3 など）も1段ずつ計算する
  const lower = node.lower && stepOnce(node.lower, env), upper = node.upper && stepOnce(node.upper, env);
  if (args.every((a, i) => a === node.args[i]) && lower === node.lower && upper === node.upper) return node;
  const out: OpNode = { ...node, args };
  if (lower) out.lower = lower;
  if (upper) out.upper = upper;
  return out;
}

/**
 * 1段ずつの展開：[元の式, 記号に値を入れた式, 1段計算した式, …, これ以上計算できない式]。
 * 等しい（eq）の式は、最後の辺（右辺）を展開する。左辺は画面で「E(X) ＝」のように前に置く。
 */
export function expand(node: FormulaNode, env: Env = {}): FormulaNode[] {
  const target = isOp(node) && node.op === "eq" ? node.args[node.args.length - 1]! : node;
  const steps: FormulaNode[] = [target];
  let cur = substitute(target, env);
  if (JSON.stringify(cur) !== JSON.stringify(target)) steps.push(cur);
  for (let i = 0; i < 100; i++) {
    const next = stepOnce(cur, env);
    if (next === cur) break;
    steps.push(next);
    cur = next;
  }
  return steps;
}

/** 木の中の関数の名前（出てくる順・重なりなし。comb・fact・E など） */
export function fnsIn(node: FormulaNode): string[] {
  const out: string[] = [];
  const walk = (n: FormulaNode) => {
    if (!isOp(n)) return;
    if (n.op === "fn" && n.name && !out.includes(n.name)) out.push(n.name);
    n.args.forEach(walk);
    if (n.lower) walk(n.lower);
    if (n.upper) walk(n.upper);
  };
  walk(node);
  return out;
}

/** 木の中の記号の key（出てくる順・重なりなし。関数の名前は入れない） */
export function symbolsIn(node: FormulaNode): string[] {
  const out: string[] = [];
  const walk = (n: FormulaNode) => {
    if (isSym(n)) { if (!out.includes(n.sym)) out.push(n.sym); return; }
    if (isNum(n)) return;
    if (n.var && !out.includes(n.var)) out.push(n.var);
    n.args.forEach(walk);
    if (n.lower) walk(n.lower);
    if (n.upper) walk(n.upper);
  };
  walk(node);
  return out;
}
