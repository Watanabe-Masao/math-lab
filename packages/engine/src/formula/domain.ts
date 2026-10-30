// 定義域と前提条件（#109）：値を入れて計算する前に、記号の定義域を確かめる。計算が途中で止まったら理由を言う。
// min・max には数のほか、同じ式の記号の key を書ける（k ≦ n）。その記号の値が決まっていないときは、その端は確かめない。
import { isNum, isOp, isSym, type Domain, type FormulaNode, type FormulaSymbol } from "./types";
import { evaluate, type Env } from "./evaluate";

/** 端の値（数か、記号の今の値。決まらなければ undefined） */
const bound = (b: number | string | undefined, values: Record<string, number>): number | undefined =>
  typeof b === "string" ? values[b] : b;

export function inDomain(v: number, d: Domain, values: Record<string, number> = {}): boolean {
  if (!Number.isFinite(v)) return false;
  if (d.integer && !Number.isInteger(v)) return false;
  if (d.nonzero && v === 0) return false;
  const lo = bound(d.min, values), hi = bound(d.max, values);
  if (lo !== undefined && (d.minOpen ? v <= lo : v < lo)) return false;
  if (hi !== undefined && (d.maxOpen ? v >= hi : v > hi)) return false;
  return true;
}

/** 定義域を文に（例：「0以上1以下」「0以上 n 以下の整数」「0より大きい」） */
export function describeDomain(d: Domain, symbols: FormulaSymbol[] = []): string {
  const name = (b: number | string) => (typeof b === "string" ? ` ${symbols.find((x) => x.key === b)?.symbol ?? b} ` : String(b));
  const parts: string[] = [];
  const lo = d.min !== undefined ? `${name(d.min)}${d.minOpen ? "より大きい" : "以上"}` : "";
  const hi = d.max !== undefined ? `${name(d.max)}${d.maxOpen ? "より小さい" : "以下"}` : "";
  if (lo || hi) parts.push([lo, hi].filter(Boolean).join("").replace(/\s+/g, " ").trim());
  if (d.nonzero) parts.push("0でない");
  const s = parts.join("・");
  return d.integer ? `${s}${s ? "の" : ""}整数` : s;
}

/** 入れた値のうち、定義域の外のもの（記号ごとに1文。記号どうしの範囲なら相手の今の値も添える） */
export function checkDomain(values: Record<string, number>, symbols: FormulaSymbol[]): string[] {
  const out: string[] = [];
  for (const s of symbols) {
    const v = values[s.key];
    if (v === undefined || !s.domain) continue;
    if (inDomain(v, s.domain, values)) continue;
    const refs = [s.domain.min, s.domain.max].filter((b): b is string => typeof b === "string" && values[b] !== undefined)
      .map((b) => `${symbols.find((x) => x.key === b)?.symbol ?? b}＝${values[b]}`);
    out.push(`${s.symbol} は ${describeDomain(s.domain, symbols)}（今 ${v}${refs.length ? `、${refs.join("・")}` : ""}）`);
  }
  return out;
}

/** スライダーの範囲：定義域の端（記号どうしなら今の値）。端がなければ fallback。整数なら刻み1 */
export function sliderRange(s: FormulaSymbol, values: Record<string, number>, fallback: { min: number; max: number; step: number }): { min: number; max: number; step: number } {
  const d = s.domain ?? {};
  let min = bound(d.min, values) ?? fallback.min, max = bound(d.max, values) ?? fallback.max;
  const step = d.integer ? 1 : fallback.step;
  if (d.minOpen) min += step;
  if (d.maxOpen) max -= step;
  if (d.integer) { min = Math.ceil(min); max = Math.floor(max); }
  return { min, max: Math.max(min, max), step };
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
