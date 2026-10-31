// 記号を開く・閉じる（#72・#109）：記号を、その記号の定義の式に置き換える。式の木（#71）の本来の使い方。
// 例：Z＝(X−μ)/σ の σ を開く → (X−μ)/√V(X)、V を開く → (X−μ)/√E((X−μ)²)。開いた所は印を残し、閉じれば元に戻る。
//
// 正しく開くための決まり（#109）
// - 関数（V(X)）を開くときは、定義の引数（X）を実際の引数に置き換える。定義の中で X に属する記号（of: X の μ）も一緒に移す：
//   実際の引数が記号 Z なら μ → μ_Z（「Z の期待値」）、式 aX+b なら μ をまず自分の定義 E(X) に開いてから移す → E(aX+b)。
//   属する記号の定義が見つからなければ開かない（意味の違う μ が残るため）。
// - 定義の中の Σ・∫ の動かす記号が、開く先の式の記号と同じ名前なら付け替える（取り込まれないように。α 変換）。
import { isNum, isOp, isSym, type Formula, type FormulaNode, type FormulaSymbol, type OpNode } from "./types";
import { boundSymbols, freeSymbols, freshName, renameBound, replaceFree } from "./scope";

/** 開き方の候補：定義の式（概念の式）と、＝が続く式のどの辺で開くか（1 が最初の右辺） */
export type Definition = { formula: Formula; side: number };

/** 記号 key（記号の葉か関数の名前）の定義になれる式を探す。左辺の頭が同じ記号・関数で、関数なら定義の引数がすべて記号のもの */
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

/** 自由な記号の葉を別の木に置き換える（Σ・∫ で縛られた所は置き換えない） */
export function substituteFree(node: FormulaNode, map: ReadonlyMap<string, FormulaNode>): FormulaNode {
  return replaceFree(node, (k) => { const r = map.get(k); return r ? clone(r) : undefined; });   // 決まりは replaceFree の1か所（#142）
}

export type OpenOptions = {
  /** 記号の定義を探す（of で属する記号を、実際の引数が式のときに開くため。μ → E(X)） */
  resolve?: (symbol: FormulaSymbol) => Definition[];
};

export type Opened = { tree: FormulaNode; symbols: FormulaSymbol[]; marks: Map<FormulaNode, string>; count: number; reason?: string };

const sub = (s: string) => s.replace(/_\{?([^}]*)\}?$/, "").trim();

/**
 * 記号 key を定義で開く。開いた所（置き換えた木）を marks に key で記録する。count は開いた数（0 なら開けなかった。reason に理由）。
 * 定義の式の記号は、まだない key だけ symbols に足す（同じ key は元の式の意味を残す）。
 */
export function openSymbol(tree: FormulaNode, symbols: FormulaSymbol[], key: string, def: Definition, marks = new Map<FormulaNode, string>(), opt: OpenOptions = {}): Opened {
  const t = def.formula.tree as OpNode;
  const lhs = t.args[0]!, rhs = t.args[def.side]!;
  const defSyms = def.formula.symbols;
  const extra: FormulaSymbol[] = [];
  const outer = freeSymbols(tree);
  let count = 0;
  let reason: string | undefined;

  /** 1か所を開いた木を作る（params：定義の引数 → 実際の引数） */
  const build = (params: Map<string, FormulaNode>): FormulaNode | null => {
    let body = clone(rhs);
    // 1. 定義の引数に属する記号（of）を移す
    const rename = new Map<string, FormulaNode>();
    for (const [p, arg] of params) {
      for (const s of defSyms.filter((x) => x.of === p && freeSymbols(body).has(x.key))) {
        if (isSym(arg) && arg.sym === p) continue;   // 同じ確率変数のまま
        if (isSym(arg)) {
          const k = `${s.key}_${arg.sym}`;
          const argSym = symbols.find((x) => x.key === arg.sym)?.symbol ?? arg.sym;
          const pSym = defSyms.find((x) => x.key === p)?.symbol ?? p;
          if (![...symbols, ...extra].some((x) => x.key === k))
            extra.push({ ...s, key: k, symbol: `${sub(s.symbol)}_${argSym}`, of: arg.sym, meaning: s.meaning.split(pSym).join(argSym) });
          rename.set(s.key, { sym: k });
        } else {
          const d = opt.resolve?.(s).find((x) => isSym((x.formula.tree as OpNode).args[0]!));
          if (!d) { reason = `${s.symbol} は ${p} に属する記号で、引数が式のときに置き換える定義が見つからない`; return null; }
          rename.set(s.key, clone((d.formula.tree as OpNode).args[d.side]!));   // μ → E(X)（このあと X → aX+b）
        }
      }
    }
    if (rename.size) body = substituteFree(body, rename);
    // 2. Σ・∫ の動かす記号が、開く先の記号や引数と同じ名前なら付け替える
    const avoid = new Set([...outer, ...[...params.values()].flatMap((a) => [...freeSymbols(a)])]);
    for (const v of boundSymbols(body)) {
      if (!avoid.has(v)) continue;
      const used = new Set([...avoid, ...boundSymbols(body), ...freeSymbols(body), ...symbols.map((x) => x.key), ...extra.map((x) => x.key)]);
      const nv = freshName(v, used);
      body = renameBound(body, v, nv);
      const s = defSyms.find((x) => x.key === v);
      if (s && !extra.some((x) => x.key === nv)) extra.push({ ...s, key: nv, symbol: `${s.symbol}′` });
      avoid.add(nv);
    }
    // 3. 定義の引数を実際の引数に
    return params.size ? substituteFree(body, params) : body;
  };

  const walk = (n: FormulaNode): FormulaNode => {
    if (isSym(n)) {
      if (isSym(lhs) && n.sym === key) { const r = build(new Map()); if (!r) return n; count++; marks.set(r, key); return r; }
      return n;
    }
    if (isNum(n)) return n;
    if (n.op === "fn" && n.name === key && isOp(lhs) && lhs.op === "fn" && n.args.length === lhs.args.length) {
      const params = new Map<string, FormulaNode>(lhs.args.map((p, i) => [(p as { sym: string }).sym, n.args[i]!]));
      const r = build(params);
      if (r) { count++; marks.set(r, key); return r; }
    }
    const out: OpNode = { ...n, args: n.args.map(walk) };
    if (n.lower) out.lower = walk(n.lower);
    if (n.upper) out.upper = walk(n.upper);
    const m = marks.get(n);
    if (m !== undefined) { marks.delete(n); marks.set(out, m); }   // 開いた所の中をさらに開いても印を残す
    return out;
  };
  const next = walk(tree);
  const have = new Set(symbols.map((x) => x.key));
  const added = [...defSyms.filter((x) => !have.has(x.key)), ...extra.filter((x) => !have.has(x.key))];
  return { tree: next, symbols: [...symbols, ...added], marks, count, ...(count === 0 && reason ? { reason } : {}) };
}

/** 開いた手順を元の式から順に当て直す（閉じる＝手順から外して当て直す） */
export function applyOpens(f: Formula, opens: { key: string; def: Definition }[], opt: OpenOptions = {}): Opened {
  let cur: Opened = { tree: f.tree, symbols: f.symbols, marks: new Map(), count: 0 };
  for (const o of opens) {
    const r = openSymbol(cur.tree, cur.symbols, o.key, o.def, cur.marks, opt);
    cur = { ...r, count: cur.count + r.count };
  }
  return cur;
}
