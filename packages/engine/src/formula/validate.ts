// 式の木の検査（教材の build と同じ決まり。#71）：記号の葉・動かす記号は symbols の key、関数の名前は symbols の key か共通の関数。
import { COMMON_FNS, isNum, isSym, type Formula, type FormulaNode } from "./types";

const ARITY: Partial<Record<string, number>> = { div: 2, pow: 2, neg: 1, sqrt: 1, abs: 1, sum: 1, prod: 1, int: 1 };

export function validateFormula(f: Formula): string[] {
  const keys = new Set(f.symbols.map((s) => s.key));
  const bad: string[] = [];
  const walk = (n: FormulaNode, bound: Set<string>) => {
    if (isNum(n)) { if (!Number.isFinite(n.num)) bad.push(`数が有限でない：${n.num}`); return; }
    if (isSym(n)) { if (!keys.has(n.sym) && !bound.has(n.sym)) bad.push(`記号 ${n.sym} が symbols にない`); return; }
    const want = ARITY[n.op];
    if (want !== undefined && n.args.length !== want) bad.push(`${n.op} の引数は ${want} 個（今 ${n.args.length}）`);
    if ((n.op === "eq" || n.op === "sub") && n.args.length < 2) bad.push(`${n.op} の引数は2個以上`);
    if (n.op === "fn" && !(n.name && (keys.has(n.name) || (COMMON_FNS as readonly string[]).includes(n.name)))) bad.push(`関数 ${n.name ?? "（名前なし）"} が symbols にも共通の関数にもない`);
    if (n.var && !keys.has(n.var)) bad.push(`動かす記号 ${n.var} が symbols にない`);
    const b = n.var ? new Set([...bound, n.var]) : bound;
    n.args.forEach((a) => walk(a, b));
    if (n.lower) walk(n.lower, bound);
    if (n.upper) walk(n.upper, bound);
  };
  walk(f.tree, new Set());
  return bad;
}
