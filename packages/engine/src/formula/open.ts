// 記号を開く・閉じる（#72）：記号を、その記号の定義の式に置き換える。式の木（#71）の本来の使い方。
// 例：Z＝(X−μ)/σ の σ を開く → (X−μ)/√V(X)、V を開く → (X−μ)/√E((X−μ)²)。開いた所は印を残し、閉じれば元に戻る。
// 記号の葉（σ）は右辺に置き換える。関数（V(X)）は、引数がすべて記号のときだけ、定義の引数（X）をその記号に置き換えて開く
// （V(aX+b) のような式の引数を結び付けると、定義の中の μ などの意味が変わってしまうため開かない）。
import { isNum, isOp, isSym, type Formula, type FormulaNode, type FormulaSymbol, type OpNode } from "./types";

/** 開き方の候補：定義の式（概念の式）と、＝が続く式のどの辺で開くか（1 が最初の右辺） */
export type Definition = { formula: Formula; side: number };

/** 記号 key（記号の葉か関数の名前）の定義になれる式を探す。左辺の頭が同じ記号・関数で、関数なら引数がすべて記号のもの */
export function definitionsFor(key: string, formulas: Formula[]): Definition[] {
  const out: Definition[] = [];
  for (const f of formulas) {
    const t = f.tree;
    if (!isOp(t) || t.op !== "eq" || t.args.length < 2) continue;
    const lhs = t.args[0]!;
    const ok = (isSym(lhs) && lhs.sym === key) || (isOp(lhs) && lhs.op === "fn" && lhs.name === key && lhs.args.every(isSym));
    if (ok) for (let side = 1; side < t.args.length; side++) out.push({ formula: f, side });
  }
  return out;
}

const clone = <T extends FormulaNode>(n: T): T => JSON.parse(JSON.stringify(n)) as T;

/** 記号の葉を別の木に置き換える（動かす記号で縛られた所は置き換えない） */
function rename(node: FormulaNode, map: Map<string, FormulaNode>): FormulaNode {
  if (isSym(node)) { const r = map.get(node.sym); return r ? clone(r) : node; }
  if (isNum(node)) return node;
  const inner = node.var && map.has(node.var) ? new Map([...map].filter(([k]) => k !== node.var)) : map;
  const out: OpNode = { ...node, args: node.args.map((a) => rename(a, inner)) };
  if (node.lower) out.lower = rename(node.lower, map);
  if (node.upper) out.upper = rename(node.upper, map);
  return out;
}

export type Opened = { tree: FormulaNode; symbols: FormulaSymbol[]; marks: Map<FormulaNode, string>; count: number };

/**
 * 記号 key を定義で開く。開いた所（置き換えた木）を marks に key で記録する。
 * 定義の式の記号は、まだない key だけ symbols に足す（同じ key は元の式の意味を残す）。count は開いた数（0 なら開けなかった）。
 */
export function openSymbol(tree: FormulaNode, symbols: FormulaSymbol[], key: string, def: Definition, marks = new Map<FormulaNode, string>()): Opened {
  const t = def.formula.tree as OpNode;
  const lhs = t.args[0]!, rhs = t.args[def.side]!;
  let count = 0;
  const walk = (n: FormulaNode): FormulaNode => {
    if (isSym(n)) {
      if (isSym(lhs) && n.sym === key) { count++; const r = clone(rhs); marks.set(r, key); return r; }
      return n;
    }
    if (isNum(n)) return n;
    if (n.op === "fn" && n.name === key && isOp(lhs) && lhs.op === "fn" && n.args.length === lhs.args.length && n.args.every(isSym)) {
      const map = new Map<string, FormulaNode>(lhs.args.map((p, i) => [(p as { sym: string }).sym, n.args[i]!]));
      count++;
      const r = rename(clone(rhs), map);
      marks.set(r, key);
      return r;
    }
    const out: OpNode = { ...n, args: n.args.map(walk) };
    if (n.lower) out.lower = walk(n.lower);
    if (n.upper) out.upper = walk(n.upper);
    for (const [k, v] of marks) if (k === n) { marks.delete(k); marks.set(out, v); }   // 開いた所の中をさらに開いても印を残す
    return out;
  };
  const next = walk(tree);
  const have = new Set(symbols.map((x) => x.key));
  const added = def.formula.symbols.filter((x) => !have.has(x.key));
  return { tree: next, symbols: [...symbols, ...added], marks, count };
}

/** 開いた手順を元の式から順に当て直す（閉じる＝手順から外して当て直す） */
export function applyOpens(f: Formula, opens: { key: string; def: Definition }[]): Opened {
  let cur: Opened = { tree: f.tree, symbols: f.symbols, marks: new Map(), count: 0 };
  for (const o of opens) {
    const r = openSymbol(cur.tree, cur.symbols, o.key, o.def, cur.marks);
    cur = { ...r, count: cur.count + r.count };
  }
  return cur;
}
