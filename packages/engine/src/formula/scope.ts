// 変数のスコープ（#109）：Σ・Π・∫ の動かす記号（var）は、その中だけで意味を持つ。
// 自由な記号（どの Σ にも縛られていない記号）を数える・縛られた記号の名前を付け替える（α 変換）。
import { isNum, isSym, type FormulaNode, type OpNode } from "./types";

/** 自由な記号（縛られていない記号の葉）。関数の名前は入れない */
export function freeSymbols(node: FormulaNode, bound: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  const walk = (n: FormulaNode, b: ReadonlySet<string>) => {
    if (isSym(n)) { if (!b.has(n.sym)) out.add(n.sym); return; }
    if (isNum(n)) return;
    // 範囲（lower・upper）は外側で決まる。中身（args）だけが var に縛られる
    if (n.lower) walk(n.lower, b);
    if (n.upper) walk(n.upper, b);
    const inner = n.var ? new Set([...b, n.var]) : b;
    n.args.forEach((a) => walk(a, inner));
  };
  walk(node, bound);
  return out;
}

/** 木の中で縛る記号（var）の一覧 */
export function boundSymbols(node: FormulaNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: FormulaNode) => { if (isSym(n) || isNum(n)) return; if (n.var) out.add(n.var); n.args.forEach(walk); if (n.lower) walk(n.lower); if (n.upper) walk(n.upper); };
  walk(node);
  return out;
}

/** 縛られた記号 from を to に付け替える（その Σ・∫ の中だけ。中でさらに同じ名前で縛られていればそこは変えない） */
export function renameBound(node: FormulaNode, from: string, to: string): FormulaNode {
  const sub = (n: FormulaNode): FormulaNode => {
    if (isSym(n)) return n.sym === from ? { sym: to } : n;
    if (isNum(n)) return n;
    if (n.var === from) return n;   // 中で同じ名前を縛り直している
    return { ...n, args: n.args.map(sub), ...(n.lower ? { lower: sub(n.lower) } : {}), ...(n.upper ? { upper: sub(n.upper) } : {}) };
  };
  const walk = (n: FormulaNode): FormulaNode => {
    if (isSym(n) || isNum(n)) return n;
    if (n.var === from) {
      const out: OpNode = { ...n, var: to, args: n.args.map(sub) };
      if (n.lower) out.lower = walk(n.lower);
      if (n.upper) out.upper = walk(n.upper);
      return out;
    }
    return { ...n, args: n.args.map(walk), ...(n.lower ? { lower: walk(n.lower) } : {}), ...(n.upper ? { upper: walk(n.upper) } : {}) };
  };
  return walk(node);
}

/** used にない新しい名前（x → x2 → x3 …） */
export function freshName(base: string, used: ReadonlySet<string>): string {
  for (let i = 2; ; i++) { const k = `${base}${i}`; if (!used.has(k)) return k; }
}
