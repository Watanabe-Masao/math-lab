// 作業台の型（stats2-course #156。元は #110 の式の作業台）：数式・意味・操作・現象を1つの行動で連動させる。
// 欄は固定の順：1 見出し → 2 主役の式 → 3 帯 → 4 結果 → 5 計算過程 → 6 入力 → 7 分布の図 → 8 変換 → 9 実験。
// 可変の欄（6 入力・7 図の棒への操作）は概念の好みでなく、分布がどう決まるか（モデルの種類）で決まる：
//   パターン1＝式で決まる分布（二項分布など）：入力は記号のつまみ、棒は押して横軸の値を選ぶ
//   パターン2＝表で決まる分布（期待値など）：入力は値の表の行（重みの −／＋）、棒は引いて重みを変える
// 新しい要素は型に足し、全部の作業台に出す（渡辺さん 2026-11-01）。
// - 数式が主役。意味のかたまり（ₙCₖ・pᵏ・(1−p)ⁿ⁻ᵏ）を式の中で直接押す。押したかたまりは強調され、式の真下の帯に名前・意味・今の値が出る
// - 帯の中の記号を押すと、記号の意味・概念・「式の中で開く」（定義の式に置き換え。閉じれば戻る）
// - スライダー（範囲は定義域から。k ≦ n のような記号どうしの範囲も連動）を動かすと、式の値・結果・分布が一緒に動く
// - 分布の棒を押すと横軸の記号（k）が選ばれ、式の値と帯の値がその k になる
// 手本：渡辺さんの「FormulaNode 計算ツリー」（式の真下の帯・その場で展開・結果の二重線）。ここに実験（#102）と予想を足していく。
import katex from "katex";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyOpens, checkMechanism, createRandom, modelMoments, modelPmf, supportOf, definitionsFor, describeDomain, distribution, emptyRecord, evaluate, expand, formatNum, frequencies, fnsIn, lhsOf, nodeAt, runTrials, openSymbol, rhsOf, sliderRange, substitute, symbolsIn, toTex,
  type Definition, type Formula as EngineFormula, type FormulaNode, type FormulaPart, type FormulaSymbol,
} from "@math-lab/engine";
import { flash, haptic, reduced, tokenMs, useTween } from "./motion";
import { useRunner } from "./runner";
import type { FormulaData } from "./Formula";
import s from "./Workspace.module.css";

export type WorkspaceData = FormulaData & { parts?: FormulaPart[] };
export type ValueTable = { id: string; name: string; icon?: string; unit?: string; values: number[]; weights: number[]; labels?: string[] };
export type TableWorkspaceData = { formula: number; linear?: number; tables: ValueTable[] };

/** モデルの種類（可変の欄のパターンを決める） */
type Model =
  | { kind: "formula"; vary: string[]; over: string; initial?: Record<string, number> }
  | { kind: "table"; tables: ValueTable[] };
type Common = {
  /** 主役の式 */
  formula: WorkspaceData;
  /** 期待値の式（パターン1：分布に期待値の線を立てる） */
  mean?: FormulaData;
  /** E(aX＋b)＝aE(X)＋b の式（あれば 8 変換の欄を出す） */
  linear?: FormulaData;
  seed?: number;
  experiment?: boolean;
  /** 式だけ（stats2-course issue 158 I1）：2 主役の式と 3 帯（記号を押す・定義の式に開く）だけを出す。実験室の「基本」の面などで、同じ式の部品を使う */
  only?: "formula";
  definitions?: (conceptId: string) => FormulaData[];
  onConcept?: (id: string) => void;
  conceptName?: (id: string) => string;
};


const render = (tex: string, display = true) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, output: "html", trust: (c) => c.command === "\\htmlData" }); }
  catch { return tex; }
};
const fmt = (v: number | undefined, d = 4) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(d))));
/** 式の中の数（stats2-course issue 158 W1）：負は「−」。足す数は「＋3」「−3」、掛ける数と負の値は括弧 */
const minus = (t: string) => t.replace(/^-/, "−");
const signed = (v: number, add: boolean) => (add ? (v < 0 ? `−${fmt(-v)}` : `＋${fmt(v)}`) : v < 0 ? `(${minus(fmt(v))})` : fmt(v));
const paren = (v: number | undefined) => (v !== undefined && v < 0 ? `(${minus(fmt(v))})` : fmt(v));
const short = (v: number) => formatNum(Number(v.toPrecision(5)));   // 計算過程の数は5桁まで
const toEngine = (fs: FormulaData[]): EngineFormula[] => fs.filter((x) => !!x.tree).map((x) => ({ symbols: x.symbols ?? [], tree: x.tree! }));
const FALLBACK = { min: 0, max: 30, step: 0.01 };

type Sel = { part?: number; sym?: string } | null;

/** 変わった数を前の値から動かして見せる（整数の値は途中も整数で） */
function Tween({ v, show, ...rest }: { v: number | undefined; show: (x: number | undefined) => string } & React.HTMLAttributes<HTMLSpanElement>) {
  const [x] = useTween([v ?? Number.NaN]);
  const shown = v === undefined ? undefined : Number.isInteger(v) ? Math.round(x!) : x;
  return <span {...rest}>{show(shown)}</span>;
}


// ---- パターン2：変換後の確率変数 Y＝aX＋b の式を、期待値の定義の木（E(X)＝Σ_x x·p(x)）から記号を付け替えて作る（手書きの別定義を増やさない） ----
const renameTree = (t: FormulaNode): FormulaNode => {
  if ("num" in t) return t;
  if ("sym" in t) return t.sym === "X" ? { sym: "Y" } : t.sym === "x" ? { sym: "y" } : t;
  return { ...t, ...(t.op === "fn" && t.name === "p" ? { name: "P" } : {}), ...(t.var === "x" ? { var: "y" } : {}), args: t.args.map(renameTree) } as FormulaNode;
};
/** 表示だけ：P(v) を P(Y＝v) と書く（主役の式と計算過程の各段に同じ形で当てる） */
const eventForm = (t: FormulaNode): FormulaNode => {
  if (!("op" in t)) return t;
  const args = t.args.map(eventForm);
  return (t.op === "fn" && t.name === "P" && args.length === 1 ? { ...t, args: [{ op: "eq", args: [{ sym: "Y" }, args[0]!] }] } : { ...t, args }) as FormulaNode;
};
function asY(f: WorkspaceData): WorkspaceData {
  if (!f.tree) return f;
  const syms = (f.symbols ?? []).filter((x) => !["X", "x", "p"].includes(x.key));
  return { ...f, parts: undefined, tree: renameTree(f.tree), symbols: [...syms,
    { symbol: "Y", key: "Y", kind: "rv", meaning: "Y＝aX＋b（X の全部の値を a 倍して b 足した確率変数）" } as FormulaSymbol,
    { symbol: "y", key: "y", kind: "index", meaning: "Y がとりうる値" } as FormulaSymbol,
    { symbol: "P( )", key: "P", meaning: "Y が y になる確率 P(Y＝y)" } as FormulaSymbol] };
}
const num6 = (x: number) => String(Number(x.toPrecision(6)));

/** パターン1：式で決まる分布（二項分布など） */
export function Workspace({ vary, over, initial, ...rest }: Common & { vary: string[]; over: string; initial?: Record<string, number> }) {
  return <Frame {...rest} model={{ kind: "formula", vary, over, initial }} />;
}
/** パターン2：表で決まる分布（期待値など）。表は場面（実験室のテーマ）から選ぶ */
export function TableWorkspace({ tables, ...rest }: Common & { tables: ValueTable[] }) {
  const [chosen, choose] = useState(tables[0]?.id);
  const table = tables.find((t) => t.id === chosen) ?? tables[0];
  if (!table) return <p role="alert">値の表がない。</p>;
  const reason = checkMechanism({ kind: "table", n: 1, values: table.values, weights: table.weights });
  if (reason || (table.labels && table.labels.length !== table.values.length)) return <p role="alert">値の表を開けない：{reason ?? "呼び名の数が値と違う"}</p>;
  return <Frame key={table.id} {...rest} model={{ kind: "table", tables }} table={table} onScene={choose} />;
}

function Frame({ formula: given, mean, linear, model, table, onScene, seed: seed0, definitions, onConcept, conceptName, experiment = true, only }: Common & { model: Model; table?: ValueTable; onScene?: (id: string) => void }) {
  const isTable = model.kind === "table";
  const vary = model.kind === "formula" ? model.vary : [], over = model.kind === "formula" ? model.over : "";
  const symOfGiven = (k: string) => (given.symbols ?? []).find((x) => x.key === k);

  // ---- 6 入力（パターン1：記号の値／パターン2：表の重み）と 8 変換（a・b） ----
  const start = useMemo(() => {
    if (model.kind !== "formula") return {};
    const v: Record<string, number> = { ...model.initial };
    for (const k of vary) {
      if (v[k] !== undefined) continue;
      const sym = symOfGiven(k); if (!sym) continue;
      const r = sliderRange(sym, v, FALLBACK);
      v[k] = sym.domain?.integer ? Math.min(r.max, Math.max(r.min, 10)) : r.min >= 0 && r.max <= 1 ? 0.3 : Number(((r.min + r.max) / 2).toFixed(2));
    }
    if (v[over] === undefined) {
      const m = mean?.tree ? evaluate(rhsOf(mean.tree), { values: v }) : undefined;
      const r = symOfGiven(over) ? sliderRange(symOfGiven(over)!, v, FALLBACK) : { min: 0, max: 0, step: 1 };
      v[over] = Math.min(r.max, Math.max(r.min, Math.round(m ?? r.min)));
    }
    return v;
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<Record<string, number>>(start);
  const clampAll = (v: Record<string, number>) => {
    const out = { ...v };
    for (const k of [...vary, over]) { const sym = symOfGiven(k); if (!sym) continue; const r = sliderRange(sym, out, FALLBACK); out[k] = Math.min(r.max, Math.max(r.min, out[k] ?? r.min)); }
    return out;
  };
  const set = (k: string, x: number) => setValues((v) => clampAll({ ...v, [k]: x }));
  const [weights, setWeights] = useState<number[]>(() => [...(table?.weights ?? [])]);
  const [notice, setNotice] = useState("");
  const setWeight = (i: number, w: number) => {
    const next = weights.map((x, j) => (j === i ? Math.max(0, Math.round(w)) : x));
    if (next.every((x) => x === 0)) { setNotice("重みを全部0にはできない。どれか1つを増やしてから動かす。"); return; }
    setNotice(""); setWeights(next);
  };
  const [a, setA] = useState(1), [b, setB] = useState(0);
  const transformed = !!linear && (a !== 1 || b !== 0);

  // パターン2の値の表（変換後）：値・確率・とりうる値（a＝0 なら1つにまとまる）
  const tableModel = table ? { kind: "table" as const, n: 1, values: table.values.map((x) => a * x + b), weights } : undefined;
  const support = tableModel ? supportOf(tableModel) : [];
  const probs = tableModel ? modelPmf(tableModel) : [];
  const totalW = weights.reduce((s2, w) => s2 + w, 0);
  const baseMeanX = table ? modelMoments({ kind: "table", n: 1, values: table.values, weights }).mean : undefined;

  // ---- 2 主役の式：パターン2で変換中は Y＝aX＋b の式 ----
  const original: WorkspaceData = isTable && transformed ? asY(given) : given;
  const display = (t: FormulaNode) => (isTable && transformed ? eventForm(t) : t);
  const baseSymbols = original.symbols ?? [];
  const symOf = (k: string, list = baseSymbols) => list.find((x) => x.key === k);
  // ---- 開く・閉じる ----
  const [opens, setOpens] = useState<{ key: string; def: Definition }[]>([]);
  const resolve = useMemo(() => (sym: FormulaSymbol) => (sym.concept && definitions ? definitionsFor(sym.key, toEngine(definitions(sym.concept))) : []), [definitions]);
  const opened = useMemo(() => applyOpens({ symbols: baseSymbols, tree: original.tree! }, opens, { resolve }), [original, opens, resolve]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tree = opened.tree, symbols = opened.symbols;

  // ---- 選択：かたまり（part）と記号（sym）を同時に持つ。かたまりの中の記号を選んでも、かたまりは選んだまま（どこにいるかを見失わない） ----
  const [sel, setSel] = useState<Sel>(null);
  const parts = original.parts ?? [];
  const partNodes = useMemo(() => new Map(parts.map((p, i) => [nodeAt(tree, p.path), i] as const).filter(([n]) => !!n) as [FormulaNode, number][]), [tree, parts]);

  // ---- 式（意味のかたまりと記号に印。選んだものを強調） ----
  const html = useMemo(() => render(toTex(display(tree), {
    symbols,
    wrap: (k, t) => `\\htmlData{sym=${k}}{${t}}`,
    mark: (n) => opened.marks.get(n),
    data: (n) => (partNodes.has(n) ? `part=${partNodes.get(n)}` : undefined),
  })), [tree, symbols, opened, partNodes, transformed]);   // eslint-disable-line react-hooks/exhaustive-deps
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stage.current; if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-part]").forEach((el) => el.toggleAttribute("data-on", sel?.part !== undefined && el.dataset.part === String(sel.part)));
    // 選んだ記号は式の中の全部の場所を強調する（同じ p が2つのかたまりにある）。選んだかたまりの中は強く
    root.querySelectorAll<HTMLElement>("[data-sym]").forEach((el) => {
      const on = !!sel?.sym && el.dataset.sym === sel.sym;
      el.toggleAttribute("data-on", on);
      el.toggleAttribute("data-here", on && (sel?.part === undefined || el.closest(`[data-part="${sel.part}"]`) !== null));
    });
  }, [html, sel]);
  // ---- かたまりの囲み：KaTeX の要素の箱は分数の分母などを含まないので、描いた字（葉の要素）の実際の位置を合わせた範囲で囲む。
  // 式が変わる・幅が変わる・字が読み込まれるたびに測り直す（線が式に重ならないように） ----
  const wrap = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<{ i: number; x: number; y: number; w: number; h: number }[]>([]);
  useLayoutEffect(() => {
    const root = stage.current, outer = wrap.current; if (!root || !outer) return;
    const measure = () => {
      const o = outer.getBoundingClientRect();
      const out: typeof boxes = [];
      root.querySelectorAll<HTMLElement>("[data-part]").forEach((el) => {
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        el.querySelectorAll<HTMLElement | SVGElement>("*").forEach((c) => {
          const leaf = c.children.length === 0 || c.tagName.toLowerCase() === "svg";
          if (!leaf || c.closest("svg") !== c && c.closest("svg")) return;
          const cls = typeof c.className === "string" ? c.className : "";
          if (/\b(strut|vlist-s|pstrut|nulldelimiter|mspace)\b/.test(cls)) return;
          const q = c.getBoundingClientRect(); if (q.width < 0.5 || q.height < 0.5) return;
          l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
        });
        if (l < r) out.push({ i: Number(el.dataset.part), x: l - o.left + outer.scrollLeft - 2, y: t - o.top - 2, w: r - l + 4, h: b - t + 5 });
      });
      setBoxes(out);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(outer);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
  }, [html]);

  // 選んだかたまりの囲みは1つだけ置き、かたまりを替えると前の場所から滑って移る（分解すると大きさが変わる）。選びをやめると消える
  const lastBox = useRef<(typeof boxes)[number] | null>(null);
  const found = boxes.find((b) => b.i === sel?.part);
  if (found) lastBox.current = found;
  const selBox = found ?? lastBox.current;
  // かたまりを選んだ瞬間だけ、囲みを少し大きくしてから戻す（どこを選んだかに目が行くように）
  const selEl = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (sel?.part === undefined || reduced() || !selEl.current?.animate) return;
    selEl.current.animate([{ transform: "scale(1)" }, { transform: "scale(1.07)", offset: 0.45 }, { transform: "scale(1)" }],
      { duration: tokenMs("--dur-sheet", 320), easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [sel?.part]);

  // ---- その場で展開する動き（FLIP。手本：FormulaNode 計算ツリー） ----
  // 開く・閉じる前に記号の位置を覚え、描き直したあと、残った記号は前の位置から滑らせ、新しく出た所は開いた記号の位置から広げる
  const before = useRef<{ rects: Map<string, DOMRect>; origin?: DOMRect; key?: string } | null>(null);
  const snapshot = (originKey?: string) => {
    const rects = new Map<string, DOMRect>(), count = new Map<string, number>();
    let origin: DOMRect | undefined;
    stage.current?.querySelectorAll<HTMLElement>("[data-sym]").forEach((el) => {
      const k = el.dataset.sym!, i = count.get(k) ?? 0; count.set(k, i + 1);
      const r = el.getBoundingClientRect(); rects.set(`${k}#${i}`, r);
      if (k === originKey && !origin) origin = r;
    });
    before.current = { rects, origin, key: originKey };
  };
  useLayoutEffect(() => {
    const b = before.current; before.current = null;
    if (!b || !stage.current || reduced()) return;
    const count = new Map<string, number>();
    stage.current.querySelectorAll<HTMLElement>("[data-sym]").forEach((el) => {
      const k = el.dataset.sym!, i = count.get(k) ?? 0; count.set(k, i + 1);
      const o = b.rects.get(`${k}#${i}`), r = el.getBoundingClientRect();
      const fresh = el.closest(`[data-open="${b.key}"]`);
      if (fresh && b.origin) {
        el.animate([{ transform: `translate(${b.origin.left - r.left}px, ${b.origin.top - r.top}px) scale(.4)`, opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
      } else if (o && (Math.abs(o.left - r.left) > .5 || Math.abs(o.top - r.top) > .5)) {
        el.animate([{ transform: `translate(${o.left - r.left}px, ${o.top - r.top}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    });
    if (b.key) stage.current.querySelectorAll(`[data-open="${b.key}"]`).forEach((el) => flash(el));
  }, [html]);

  const onStage = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const part = t.closest<HTMLElement>("[data-part]"), sym = t.closest<HTMLElement>("[data-sym]");
    // かたまりの中なら、まずかたまりを選ぶ。選んだかたまりの中の記号を押すと、かたまりを選んだまま記号も選ぶ（同じ記号ならたたむ）
    const pi = part ? Number(part.dataset.part) : undefined, k = sym?.dataset.sym;
    if (pi !== undefined) setSel(sel?.part === pi && k ? { part: pi, sym: sel.sym === k ? undefined : k } : { part: pi });
    else if (k) setSel(sel?.sym === k && sel.part === undefined ? null : { sym: k });
    else setSel(null);
  };


  // 変換で式が Y に替わったら、開いた所と選びを戻す（記号が替わるので）
  useEffect(() => { setOpens([]); setSel(null); }, [isTable && transformed]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 値 ----
  const env: { values: Record<string, number>; domains?: Record<string, number[]>; fns?: Record<string, (x: number) => number> } = isTable
    ? (transformed ? { values: {}, domains: { y: support }, fns: { P: (y: number) => probs[support.indexOf(y)] ?? 0 } } : { values: {}, domains: { x: support }, fns: { p: (x: number) => probs[support.indexOf(x)] ?? 0 } })
    : { values };
  const result = evaluate(rhsOf(tree), env);
  const lhs = lhsOf(tree);
  const overSym = symOfGiven(over);
  const range = overSym ? sliderRange(overSym, values, FALLBACK) : { min: 0, max: 0, step: 1 };
  // 分布（横軸は元の X の値。図は変換後の値 v＝ax＋b で並べる。a＝0 なら1本にまとめる）
  const distX = useMemo(() => (isTable ? (table!.values.map((x, i) => ({ x, y: totalW > 0 ? weights[i]! / totalW : 0 }))) : distribution(given.tree!, over, range.min, range.max, env)),
    [isTable, JSON.stringify(weights), given.tree, over, range.min, range.max, JSON.stringify(values)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const meanX = isTable ? baseMeanX : mean?.tree ? evaluate(rhsOf(mean.tree), env) : undefined;
  const meanValue = meanX === undefined ? undefined : a * meanX + b;
  const bars = useMemo(() => {
    const m = new Map<number, { v: number; y: number; xs: number[]; rows: number[] }>();
    distX.forEach((d, i) => { const v = Number((a * d.x + b).toPrecision(12)); const g = m.get(v) ?? { v, y: 0, xs: [], rows: [] }; g.y += d.y ?? 0; g.xs.push(d.x); g.rows.push(i); m.set(v, g); });
    return [...m.values()].sort((p, q) => p.v - q.v);
  }, [distX, a, b]);
  const dist = useMemo(() => bars.map((g) => ({ x: g.v, y: g.y })), [bars]);   // 実験はこの分布（変換後の値）から引く
  // ---- 実験（#102）：理論の分布から種つき乱数で1回ずつ引き、結果を同じ図に積み上げる。条件（n・p）を変えたら記録を分ける ----
  const [seed, setSeed] = useState(() => seed0 ?? (Date.now() % 100000));
  const rng = useRef(createRandom(seed));
  const [rec, setRec] = useState(emptyRecord);
  const [lastDraw, setLastDraw] = useState<number | null>(null);
  const cond = JSON.stringify([vary.map((k) => values[k]), weights, a, b]);
  useEffect(() => { stop(); setRec(emptyRecord()); setLastDraw(null); }, [cond]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 100回は10回ずつ続けて引き、点が棒に近づいていくのを見せる（同じ種なら一度に引いたのと同じ結果）。1回は玉が落ちる
  const { start: startRun, stop } = useRunner();   // 実行中の更新は1か所で止める（止めた後の更新は捨てる。#142）
  const run = (count: number) => {
    haptic(); stop();
    if (count === 1 || reduced()) {
      const r = runTrials(rng.current, dist, count, rec);
      setRec(r); setLastDraw(count === 1 ? r.values[r.values.length - 1]! : null);
      return;
    }
    let cur = rec, done = 0;
    const per = Math.max(1, Math.ceil(count / 10)), d0 = dist;
    setLastDraw(null);
    startRun(() => {
      const m = Math.min(per, count - done);
      cur = runTrials(rng.current, d0, m, cur); done += m; setRec(cur);
      return done >= count;
    }, 45);
  };
  const clearRec = () => { stop(); const s2 = Date.now() % 100000; setSeed(s2); rng.current = createRandom(s2); setRec(emptyRecord()); setLastDraw(null); };
  const freq = frequencies(rec);


  // ---- 5 計算過程：パターン1は値を入れた式から1段ずつ、パターン2は Σ を1項ずつ（どちらも最後が 4 結果の値） ----
  const steps = useMemo(() => (isTable ? [rhsOf(tree), ...expand(rhsOf(tree), env)] : expand(tree, env)), [tree, JSON.stringify(values), JSON.stringify(probs), JSON.stringify(support), transformed]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState(1);
  const shownStep = Math.min(step, steps.length - 1);
  const isProb = lhs && "op" in lhs && lhs.op === "fn" && lhs.name === "P";
  // 初期値に戻すときは実験のタイマーも止める（止めないと、消した記録を次の更新が書き戻す。#142）
  const reset = () => { stop(); snapshot(); setValues(start); setWeights([...(table?.weights ?? [])]); setA(1); setB(0); setNotice(""); setOpens([]); setSel(null); setStep(1); setRec(emptyRecord()); setLastDraw(null); };
  useEffect(() => { setStep(1); }, [JSON.stringify(weights), transformed]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 開き方（選んだ記号） ----
  const selSym = sel?.sym ? symOf(sel.sym, symbols) : undefined;
  // 記号・関数（ₙCₖ・k!）を開ける定義：その概念の式のうち、今の式の中で実際に開けるもの
  const choicesFor = (key: string): Definition[] => {
    const sym = symOf(key, symbols);
    if (!sym?.concept || !definitions) return [];
    return definitionsFor(key, toEngine(definitions(sym.concept))).filter((d) => openSymbol(tree, symbols, key, d, new Map(), { resolve }).count > 0);
  };
  const choices = useMemo(() => (selSym ? choicesFor(selSym.key) : []), [selSym, definitions, tree, symbols, resolve]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 開いたあとも、かたまりは選んだまま（分解した中身がそのまま帯に出る。続けて k! なども分解できる）
  const open = (d: Definition, key = selSym!.key) => { haptic(); snapshot(key); setOpens((o) => [...o, { key, def: d }]); setSel((x) => (x?.part !== undefined ? { part: x.part } : null)); };
  const defTex = (d: Definition) => { const t = d.formula.tree as { args: FormulaNode[] }; return `${toTex(t.args[0]!, { symbols: d.formula.symbols })}=${toTex(t.args[d.side]!, { symbols: d.formula.symbols })}`; };
  const pickSym = (k: string) => { haptic(); setSel((x) => ({ part: x?.part, sym: x?.sym === k ? undefined : k })); };
  // 開いたものは、最後に開いたものから（たたむの並びを開いた順の逆にする）
  const openKeys = [...new Set(opened.marks.values())].sort((a, b) => opens.map((o) => o.key).lastIndexOf(b) - opens.map((o) => o.key).lastIndexOf(a));
  // 開いた所の印（marks）を、かたまりの中から集める。「たたむ」は開いた中身を選んでいる「分解する」の右に出す（渡辺さん 2026-10-31）
  const marksIn = (n: FormulaNode): string[] => {
    const out = new Set<string>();
    const walk = (x: unknown) => { if (!x || typeof x !== "object") return; const m = opened.marks.get(x as FormulaNode); if (m) out.add(m); for (const v of Object.values(x)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); } };
    walk(n);
    return [...out];
  };
  const selPartNode = sel?.part !== undefined && parts[sel.part] ? nodeAt(tree, parts[sel.part]!.path) : undefined;
  const shownFold = new Set(selPartNode ? marksIn(selPartNode) : []);
  const restKeys = openKeys.filter((k) => !shownFold.has(k));
  const close = (k: string) => { snapshot(); setOpens((o) => {
    const kept: typeof o = []; let cur = { tree: original.tree!, symbols: baseSymbols };
    for (const x of o.filter((x) => x.key !== k)) { const r = openSymbol(cur.tree, cur.symbols, x.key, x.def, new Map(), { resolve }); if (r.count) { kept.push(x); cur = r; } }
    return kept;
  }); };

  // ---- 帯：上から「かたまり」→「この中の記号」→「選んだ記号」。下の段を選んでも上の段は残る（パンくず） ----
  const strip = () => {
    if (!sel) return <div className={`${s.strip} ${s.stripEmpty}`} data-testid="ws-strip"><p className={s.hint}>{parts.length ? "式のかたまり（ₙCₖ・pᵏ など）を押すと、意味と今の値がここに出る。" : "式の記号を押すと、意味と今の値がここに出る。"}</p></div>;
    const p = sel.part !== undefined ? parts[sel.part] : undefined;
    const node = p ? nodeAt(tree, p.path) : undefined;
    // この中の記号：値の記号（n・k・p）と、意味のある関数（ₙCₖ・k!）。関数は「分解する」で定義の式に開ける
    const fns = node ? fnsIn(node).filter((k) => symOf(k, symbols)) : [];
    const inside = node ? [...fns, ...symbolsIn(node).filter((k) => symOf(k, symbols))] : [];
    const breakable = fns.map((k) => ({ key: k, defs: choicesFor(k) })).filter((x) => x.defs.length > 0);
    // たたむは、最後に開いたものから左に並べる（渡辺さん 2026-11-01：同じ指の位置で順に開き、開き切ったら同じ位置で順に閉じられる）
    const lastOpen = (k: string) => opens.map((o) => o.key).lastIndexOf(k);
    const foldable = (node ? marksIn(node) : []).sort((a, b) => lastOpen(b) - lastOpen(a));
    const v = selSym ? values[selSym.key] : undefined;
    return (
      <div className={s.strip} data-testid="ws-strip">
        {p && node && (
          <div className={s.ctx} key={`p${sel.part}`}>
            <span className={s.ctxTex} dangerouslySetInnerHTML={{ __html: render(toTex(node, { symbols }), false) }} />
            <Tween className={s.ctxVal} data-testid="ws-part-value" v={evaluate(node, env)} show={(x) => fmt(x)} />
            <b className={s.ctxName}>{p.name}</b>
            {!selSym && <p className={s.ctxText}>{p.meaning}</p>}
            {(breakable.length > 0 || foldable.length > 0) && (
              <div className={s.ctxActs}>
                {breakable.map(({ key, defs }) => defs.map((d, i) => (
                  <button key={`${key}${i}`} type="button" className={s.act} onClick={() => open(d, key)} data-testid={`ws-break-${key}`}>
                    分解する<span dangerouslySetInnerHTML={{ __html: render(defTex(d), false) }} />
                  </button>
                )))}
                {foldable.map((k) => <button key={`f${k}`} type="button" className={s.tool} onClick={() => close(k)} data-testid={`ws-close-${k}`}>{symOf(k, symbols)?.symbol ?? k} をたたむ</button>)}
              </div>
            )}
          </div>
        )}
        {inside.length > 0 && (
          <div className={s.chips} role="group" aria-label="この中の記号">
            <span className={s.muted}>この中の記号</span>
            {inside.map((k) => (
              <button key={k} type="button" className={s.chip} aria-pressed={sel.sym === k} onClick={() => pickSym(k)}>{symOf(k, symbols)!.symbol}</button>
            ))}
          </div>
        )}
        {selSym && (
          <div className={s.sym} key={`s${selSym.key}`} data-testid="ws-sym">
            <span className={s.symBig}>{selSym.symbol}</span>
            <div className={s.symText}><b>{selSym.meaning}</b>{selSym.domain && <p>{describeDomain(selSym.domain, symbols)}</p>}</div>
            {v !== undefined && <span className={s.symVal}>{fmt(v)}</span>}
            {(choices.length > 0 || (selSym.concept && onConcept)) && (
              <div className={s.symActs}>
                {choices.map((d, i) => (
                  <button key={i} type="button" className={s.act} onClick={() => open(d)} data-testid="ws-open">
                    式の中で開く{choices.length > 1 ? `（形${i + 1}）` : ""}
                    <span dangerouslySetInnerHTML={{ __html: render(toTex((d.formula.tree as { args: FormulaNode[] }).args[d.side]!, { symbols: d.formula.symbols }), false) }} />
                  </button>
                ))}
                {selSym.concept && onConcept && <button type="button" className={s.link} onClick={() => onConcept(selSym.concept!)}>{conceptName?.(selSym.concept) ?? selSym.concept} を見る</button>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- 7 分布の図：理論＝棒、実験＝点（同じ縦軸）、期待値＝点線。横は値 v に比例（値の間が不ぞろいでも位置で見せる） ----
  const W = 340, TOP = 18, BASE = 118, H = BASE + 26, LEFT = 0, RIGHT = 34;
  const empMax = rec.values.length ? Math.max(0, ...bars.map((d) => freq.get(d.v) ?? 0)) : 0;
  const rawMax = Math.max(1e-9, ...bars.map((d) => d.y), empMax);
  const tick = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => rawMax / t <= 4) ?? 1;
  const yMax = Math.max(tick, Math.ceil(rawMax / tick - 1e-9) * tick);
  const [yMaxT] = useTween([yMax]);
  const ys = useTween(bars.map((d) => d.y));
  const yPos = (v: number) => BASE - (v / yMaxT!) * (BASE - TOP);
  const vs = bars.map((d) => d.v);
  const gap = vs.length > 1 ? Math.min(...vs.slice(1).map((v, i) => v - vs[i]!)) : 1;
  const span = vs.length > 1 ? vs[vs.length - 1]! - vs[0]! + gap : gap;
  const lo = (vs[0] ?? 0) - gap / 2;
  const xPos = (v: number) => LEFT + ((v - lo) / span) * (W - LEFT - RIGHT);
  const bw = (gap / span) * (W - LEFT - RIGHT);
  const barW = Math.max(2, Math.min(bw - Math.max(3, bw * 0.38), 44));
  const every = bars.length <= 13 ? 1 : bars.length <= 31 ? 5 : 10;
  const cur = isTable ? undefined : Number((a * values[over]! + b).toPrecision(12));
  // パターン1：押して横軸の値を選ぶ。パターン2：引いて重みを変える（確率をその高さにする重み）
  const chooseV = (g: (typeof bars)[number]) => { if (isTable || g.xs.length !== 1) return; haptic(); set(over, g.xs[0]!); };
  const svgRef = useRef<SVGSVGElement>(null);
  const dragTo = (g: (typeof bars)[number], clientY: number, scale: number) => {
    const svg = svgRef.current; if (!svg || g.rows.length !== 1) return;
    const r = svg.getBoundingClientRect(), y = ((clientY - r.top) / r.height) * H;
    const p = Math.min(0.98, Math.max(0, (BASE - y) / (BASE - TOP) * scale));
    const i = g.rows[0]!, others = totalW - weights[i]!;
    setWeight(i, others > 0 ? (p * others) / (1 - p) : p > 0 ? 1 : 0);
  };
  const dragScale = useRef<number | null>(null);
  const pct = (v: number) => `${Number((v * 100).toFixed(v < 0.1 ? 1 : 0))}%`;
  const barPath = (x: number, y: number) => {
    const l = x - barW / 2, r = Math.min(3, barW / 2, BASE - y);
    return `M${l},${BASE}V${y + r}Q${l},${y} ${l + r},${y}H${l + barW - r}Q${l + barW},${y} ${l + barW},${y + r}V${BASE}Z`;
  };
  const symText = isTable ? (transformed ? "y" : "x") : overSym?.symbol ?? over;
  const labelOf = (g: (typeof bars)[number]) => (isTable && !transformed && g.rows.length === 1 && table!.labels ? table!.labels[g.rows[0]!]! : num6(g.v));
  return (
    <section className={s.ws} data-testid="workspace" data-pattern={model.kind} data-only={only} aria-label="式の作業台">
      {/* 1 見出し：式の名前・場面の選択（場面が2つ以上のとき）・初期値に戻す */}
      {!only && <><div className={s.head}><b>{given.label ?? "式を動かす"}</b>
        <button type="button" className={s.reset} onClick={reset} data-testid="ws-reset">初期値に戻す</button></div>
      {model.kind === "table" && model.tables.length > 1 && (
        <label className={s.scene}><span className={s.muted}>場面</span>
          <select value={table!.id} onChange={(e) => onScene?.(e.target.value)} data-testid="ws-scene">
            {model.tables.map((t) => <option key={t.id} value={t.id}>{t.icon ? `${t.icon} ` : ""}{t.name}</option>)}
          </select></label>
      )}</>}
      <div ref={wrap} className={s.stageWrap}>
        <div className={s.boxes} aria-hidden="true">
          {boxes.map((b) => <span key={b.i} className={s.box} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />)}
          {selBox && <span ref={selEl} className={s.boxSel} data-on={sel?.part !== undefined || undefined} style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }} />}
        </div>
        <div ref={stage} className={s.stage} onClick={onStage} dangerouslySetInnerHTML={{ __html: html }} data-testid="ws-formula" />
      </div>
      {strip()}
      {(restKeys.length > 0 || opens.length > 1) && (
        <div className={s.tools}>
          {restKeys.map((k) => <button key={k} type="button" className={s.tool} onClick={() => close(k)} data-testid={`ws-close-${k}`}>{symOf(k, symbols)?.symbol ?? k} をたたむ</button>)}
          {opens.length > 1 && <button type="button" className={s.tool} onClick={() => { snapshot(); setOpens([]); }}>元の式に戻す</button>}
        </div>
      )}
      {!only && <>
      <div className={s.result} data-testid="ws-result">
        <span className={s.resultLhs} data-testid="ws-result-lhs" dangerouslySetInnerHTML={{ __html: lhs ? render(toTex(isTable ? lhs : substitute(lhs, { values: { [over]: values[over]! } }), { symbols }), false) : "" }} />
        <Tween className={s.resultVal} data-testid="ws-result-val" data-value={result} v={result} show={(x) => (isProb && x !== undefined ? `${(x * 100).toFixed(2)}%` : fmt(x))} />
        {isProb && <small className={s.resultSub}>{fmt(result, 5)}</small>}
      </div>
      {steps.length > 1 && (
        <div className={s.calc} data-testid="ws-calc">
          <div className={s.calcHead}>
            <span className={s.muted}>計算の段</span>
            <button type="button" className={s.step} onClick={() => setStep(Math.max(1, shownStep - 1))} disabled={shownStep <= 1} aria-label="前の段">‹</button>
            <span className={s.stepNo}>{shownStep}／{steps.length - 1}</span>
            <button type="button" className={s.step} onClick={() => setStep(Math.min(steps.length - 1, shownStep + 1))} disabled={shownStep >= steps.length - 1} aria-label="次の段">›</button>
          </div>
          <div className={s.calcTex} data-testid="ws-calc-tex" dangerouslySetInnerHTML={{ __html: render(`${toTex(display(steps[shownStep]!), { symbols, num: short })}${shownStep < steps.length - 1 ? `=${toTex(display(steps[steps.length - 1]!), { symbols, num: short })}` : ""}`, false) }} />
        </div>
      )}
      {/* 6 入力：パターン1＝記号のつまみ／パターン2＝値の表の行 */}
      {model.kind === "formula" && <div className={s.sliders}>
        {[...vary, over].map((k) => {
          const sym = symOf(k); if (!sym) return null;
          const r = sliderRange(sym, values, FALLBACK);
          const fill = r.max > r.min ? ((values[k]! - r.min) / (r.max - r.min)) * 100 : 0;
          return (
            <label key={k} className={s.slider}>
              <span className={s.sliderSym}>{sym.symbol}</span>
              <span className={s.sliderName}>{sym.meaning.split("（")[0]}</span>
              <b className={s.sliderVal}>{fmt(values[k], 2)}</b>
              <input type="range" min={r.min} max={r.max} step={r.step} value={values[k]} onChange={(e) => set(k, Number(e.target.value))}
                style={{ "--fill": `${fill}%` } as React.CSSProperties} aria-label={`${sym.symbol}（${sym.meaning}）`} data-testid={`ws-slider-${k}`} />
            </label>
          );
        })}
      </div>}
      {model.kind === "table" && table && (
        <div className={s.rows} role="group" aria-label="値ごとの重み" data-testid="ws-rows">
          <div className={s.rowHead}><span>{transformed ? "y＝ax＋b" : "値 x"}</span><span>重み</span><span>確率</span></div>
          {table.values.map((x, i) => {
            const y = a * x + b, p = totalW > 0 ? weights[i]! / totalW : 0;
            return (
              <div key={i} className={s.row}>
                <span className={s.rowVal}>{transformed ? num6(y) : table.labels?.[i] ?? num6(x)}{table.unit && !(table.labels && !transformed) ? <small>{table.unit}</small> : null}</span>
                <span className={s.stepper}>
                  <button type="button" className={s.step} onClick={() => { haptic(); setWeight(i, weights[i]! - 1); }} aria-label={`${table.labels?.[i] ?? num6(x)} の重みを減らす`} data-testid={`ws-minus-${i}`}>−</button>
                  <b data-testid={`ws-weight-${i}`}>{weights[i]}</b>
                  <button type="button" className={s.step} onClick={() => { haptic(); setWeight(i, weights[i]! + 1); }} aria-label={`${table.labels?.[i] ?? num6(x)} の重みを増やす`} data-testid={`ws-plus-${i}`}>＋</button>
                </span>
                <span className={s.rowProb} data-testid={`ws-prob-${i}`} data-value={p}>{num6(p)}</span>
              </div>
            );
          })}
          <p className={s.hint} role="status">{notice || `重みの合計 ${num6(totalW)}・確率は重み÷合計（合計1）。棒を上下に引いても変えられる`}</p>
        </div>
      )}
      {/* 7 分布の図：棒への操作はモデルの種類で決まる（パターン1＝押して選ぶ／パターン2＝引いて重みを変える） */}
      <figure className={s.chart} aria-label={`${symText} ごとの確率`}>
        <figcaption className={s.chartHead}>
          <b>{isTable ? `${symText} ごとの確率` : `${overSym?.meaning.split("（")[0] ?? over} ${symText} ごとの確率`}</b>
          <span className={s.legend}>
            <span><i className={s.keyBar} />理論</span>
            {rec.values.length > 0 && <span><i className={s.keyDot} />実験 {rec.values.length} 回</span>}
            {meanValue !== undefined && <span><i className={s.keyMean} />期待値 {fmt(meanValue, 2)}</span>}
          </span>
        </figcaption>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" data-testid="ws-chart">
          {Array.from({ length: Math.round(yMax / tick) }, (_, i) => (i + 1) * tick).map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={W - RIGHT + 4} y1={yPos(t)} y2={yPos(t)} className={s.grid} />
              <text x={W - 2} y={yPos(t) + 3.5} className={s.yTick} textAnchor="end">{pct(t)}</text>
            </g>
          ))}
          {bars.map((g, i) => {
            const on = g.v === cur, y = yPos(ys[i] ?? 0), drag = isTable && g.rows.length === 1;
            return (
              <g key={g.v} className={s.barG} onClick={() => chooseV(g)} data-testid={`ws-bar-${num6(g.v)}`} aria-label={`${symText}＝${num6(g.v)}：${fmt(g.y)}`}
                onPointerDown={drag ? (e) => { dragScale.current = yMaxT!; (e.currentTarget as Element).setPointerCapture(e.pointerId); dragTo(g, e.clientY, dragScale.current); } : undefined}
                onPointerMove={drag ? (e) => { if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) dragTo(g, e.clientY, dragScale.current ?? yMaxT!); } : undefined}
                onPointerUp={drag ? () => { dragScale.current = null; } : undefined}>
                <rect x={xPos(g.v) - Math.max(bw, 28) / 2} y={0} width={Math.max(bw, 28)} height={H} className={drag ? `${s.hit} ${s.hitDrag}` : s.hit} />
                {BASE - y > 0.3 && <path d={barPath(xPos(g.v), y)} className={on ? s.barOn : s.bar} />}
              </g>
            );
          })}
          <line x1={LEFT} x2={W - RIGHT + 4} y1={BASE} y2={BASE} className={s.base} />
          {meanValue !== undefined && (
            <line x1={xPos(meanValue)} x2={xPos(meanValue)} y1={TOP - 6} y2={BASE} className={s.mean} data-testid="ws-mean" data-value={meanValue} data-x={xPos(meanValue)} />
          )}
          {rec.values.length > 0 && bars.map((g) => (
            <circle key={g.v === lastDraw ? `e${g.v}-${rec.values.length}` : `e${g.v}`} cx={xPos(g.v)} cy={yPos(freq.get(g.v) ?? 0)} r={g.v === lastDraw ? 4 : 3}
              className={g.v === lastDraw ? `${s.emp} ${s.empJust}` : s.emp} data-testid={`ws-emp-${num6(g.v)}`}
              style={g.v === lastDraw ? ({ "--drop": `${TOP - 14 - yPos(freq.get(g.v) ?? 0)}px` } as React.CSSProperties) : undefined} />
          ))}
          {bars.map((g, i) => [g, ys[i] ?? 0] as const).filter(([g]) => g.v === cur).map(([g, yv]) => (
            <text key={`v${g.v}`} x={Math.min(W - RIGHT - 14, Math.max(LEFT + 14, xPos(g.v)))} y={Math.min(yPos(yv), rec.values.length ? yPos(freq.get(g.v) ?? 0) : BASE) - 8} className={s.valLabel} textAnchor="middle">{pct(g.y)}</text>
          ))}
          {bars.map((g, i) => {
            const on = g.v === cur;
            if (!on && (i % every !== 0 || (cur !== undefined && Math.abs(xPos(g.v) - xPos(cur)) < 16))) return null;
            return <text key={`t${g.v}`} x={xPos(g.v)} y={BASE + 15} className={on ? s.xTickOn : s.xTick} textAnchor="middle">{labelOf(g)}</text>;
          })}
        </svg>
      </figure>
      {/* 8 変換：全部の値を a 倍して b 足す（概念に E(aX＋b) の式があるとき） */}
      {linear && (
        <fieldset className={s.linear} data-testid="ws-linear">
          <legend>全部の値を a 倍して b 足す（Y＝aX＋b）</legend>
          {([["a", a, setA, -3, 3, 0.5, "掛ける定数"], ["b", b, setB, -10, 10, 1, "足す定数"]] as const).map(([k, v, setV, mn, mx, st, name]) => (
            <label key={k} className={s.slider}>
              <span className={s.sliderSym}>{k}</span><span className={s.sliderName}>{name}</span><b className={s.sliderVal}>{v}</b>
              <input type="range" min={mn} max={mx} step={st} value={v} onChange={(e) => { haptic(); setV(Number(e.target.value)); }}
                style={{ "--fill": `${((v - mn) / (mx - mn)) * 100}%` } as React.CSSProperties} aria-label={`${k}（${name}）`} data-testid={`ws-${k}`} />
            </label>
          ))}
          {linear.tree && <div className={s.calcTex} dangerouslySetInnerHTML={{ __html: render(toTex(linear.tree, { symbols: linear.symbols }), false) }} />}
          <p className={s.linearOut}>{meanX === undefined ? "—" : <>E(aX＋b)＝{signed(a, false)}×{paren(meanX)}{signed(b, true)}＝<b data-testid="ws-linear-result">{minus(fmt(meanValue, 4))}</b></>}</p>
          {a === 0 && <p className={s.hint}>すべての値が {b} になり、確率は1つの値にまとまる。</p>}
        </fieldset>
      )}
      {/* 9 実験：理論の分布（変換後の値）から1回ずつ引き、同じ図に積み上げる */}
      {experiment && <div className={s.exp} data-testid="ws-exp">
        <div className={s.expRow}>
          <b>実験する</b>
          <div className={s.expBtns} role="group" aria-label="実験の回数">
            <button type="button" className={s.expBtn} onClick={() => run(1)} data-testid="ws-run-1">1回</button>
            <button type="button" className={s.expBtn} onClick={() => run(100)} data-testid="ws-run-100">100回</button>
          </div>
        </div>
        <p className={s.expStat} data-testid="ws-exp-stat" aria-live="polite">
          {rec.values.length
            ? <>実験 <b>{rec.values.length}</b> 回{lastDraw !== null && <>（今回 {symText}＝<b>{num6(lastDraw)}</b>）</>}・平均 <b>{fmt(rec.mean, 2)}</b>{meanValue !== undefined && <>（理論 {fmt(meanValue, 2)}）</>}</>
            : <>まだ実験していない。回数を増やすと、点が棒の高さに近づくかを見る。</>}
        </p>
        <div className={s.expFoot}>
          <span>種 {seed}</span>
          <button type="button" className={s.clear} onClick={clearRec} disabled={!rec.values.length}>記録を消す</button>
        </div>
      </div>}
      </>}
    </section>
  );
}
