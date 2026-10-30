// 定義域と前提条件（#109）：値を入れて計算する前に、記号の定義域を確かめる。計算が途中で止まったら理由を言う。
import { isNum, isOp, isSym, type Domain, type FormulaNode, type FormulaSymbol } from "./types";
import { evaluate, type Env } from "./evaluate";

export function inDomain(v: number, d: Domain): boolean {
  if (!Number.isFinite(v)) return false;
  if (d.integer && !Number.isInteger(v)) return false;
  if (d.nonzero && v === 0) return false;
  if (d.min !== undefined && (d.minOpen ? v <= d.min : v < d.min)) return false;
  if (d.max !== undefined && (d.maxOpen ? v >= d.max : v > d.max)) return false;
  return true;
}

/** 定義域を文に（例：「0以上1以下」「0より大きい整数」） */
export function describeDomain(d: Domain): string {
  const parts: string[] = [];
  const lo = d.min !== undefined ? `${d.min}${d.minOpen ? "より大きい" : "以上"}` : "";
  const hi = d.max !== undefined ? `${d.max}${d.maxOpen ? "より小さい" : "以下"}` : "";
  if (lo || hi) parts.push([lo, hi].filter(Boolean).join(""));
  if (d.nonzero) parts.push("0でない");
  const s = parts.join("・");
  return d.integer ? `${s}${s ? "の" : ""}整数` : s;
}

/** 入れた値のうち、定義域の外のもの（記号ごとに1文） */
export function checkDomain(values: Record<string, number>, symbols: FormulaSymbol[]): string[] {
  const out: string[] = [];
  for (const s of symbols) {
    const v = values[s.key];
    if (v === undefined || !s.domain) continue;
    if (!inDomain(v, s.domain)) out.push(`${s.symbol} は ${describeDomain(s.domain)}（今 ${v}）`);
  }
  return out;
}

/** 展開が止まった理由：引数がそろっているのに値にならない演算を探す（0 で割る・負の数の平方根など） */
export function stopReason(node: FormulaNode, env: Env = {}): string | undefined {
  if (!isOp(node)) return undefined;
  for (const a of node.args) { const r = stopReason(a, env); if (r) return r; }
  if (node.op === "eq" || node.op === "sum" || node.op === "prod" || node.op === "int") return undefined;
  if (!node.args.every((a) => isNum(a) || (isSym(a) && (a.sym === "e" || a.sym === "pi")))) return undefined;
  const v = evaluate(node, env);
  if (v !== undefined && Number.isFinite(v)) return undefined;
  const x = node.args.map((a) => evaluate(a, env));
  switch (node.op) {
    case "div": return x[1] === 0 ? "0 で割ることになる" : undefined;
    case "sqrt": return "負の数の平方根になる";
    case "pow": return x[0] === 0 && (x[1] ?? 0) < 0 ? "0 の負の累乗（0 で割る）になる" : "累乗が実数にならない";
    case "fn": return node.name === "log" ? "0以下の数の対数になる" : node.name === "comb" || node.name === "fact" ? "組合せ・階乗は0以上の整数だけ" : `${node.name} が計算できない`;
    default: return "値が有限にならない";
  }
}
