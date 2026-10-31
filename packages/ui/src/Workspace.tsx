// 式の作業台（stats2-course #110）：数式・意味・操作・現象を1つの行動で連動させる。
// - 数式が主役。意味のかたまり（ₙCₖ・pᵏ・(1−p)ⁿ⁻ᵏ）を式の中で直接押す。押したかたまりは強調され、式の真下の帯に名前・意味・今の値が出る
// - 帯の中の記号を押すと、記号の意味・概念・「式の中で開く」（定義の式に置き換え。閉じれば戻る）
// - スライダー（範囲は定義域から。k ≦ n のような記号どうしの範囲も連動）を動かすと、式の値・結果・分布が一緒に動く
// - 分布の棒を押すと横軸の記号（k）が選ばれ、式の値と帯の値がその k になる
// 手本：渡辺さんの「FormulaNode 計算ツリー」（式の真下の帯・その場で展開・結果の二重線）。ここに実験（#102）と予想を足していく。
import katex from "katex";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyOpens, createRandom, definitionsFor, describeDomain, distribution, emptyRecord, evaluate, expand, formatNum, frequencies, fnsIn, lhsOf, nodeAt, runTrials, openSymbol, rhsOf, sliderRange, substitute, symbolsIn, toTex,
  type Definition, type Formula as EngineFormula, type FormulaNode, type FormulaPart, type FormulaSymbol,
} from "@math-lab/engine";
import { flash, haptic, reduced, tokenMs, useTween } from "./motion";
import type { FormulaData } from "./Formula";
import s from "./Workspace.module.css";

export type WorkspaceData = FormulaData & { parts?: FormulaPart[] };

type Props = {
  /** 主役の式（木と意味のかたまり） */
  formula: WorkspaceData;
  /** 期待値の式（分布に ▲ を立てる。任意） */
  mean?: FormulaData;
  /** スライダーで動かす記号 */
  vary: string[];
  /** 分布の横軸の記号（棒を押すと選ぶ） */
  over: string;
  /** 最初の値（なければ定義域の中ほど） */
  initial?: Record<string, number>;
  /** 実験の種（なければ時刻から。画面に出し、同じ種なら同じ結果） */
  seed?: number;
  /** 実験（1回・100回）を出す（既定 true。実験室の中に置くときは false） */
  experiment?: boolean;
  definitions?: (conceptId: string) => FormulaData[];
  onConcept?: (id: string) => void;
  conceptName?: (id: string) => string;
};

const render = (tex: string, display = true) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, output: "html", trust: (c) => c.command === "\\htmlData" }); }
  catch { return tex; }
};
const fmt = (v: number | undefined, d = 4) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(d))));
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

export function Workspace({ formula: original, mean, vary, over, initial, seed: seed0, definitions, onConcept, conceptName, experiment = true }: Props) {
  const baseSymbols = original.symbols ?? [];
  const symOf = (k: string, list = baseSymbols) => list.find((x) => x.key === k);

  // ---- 値（スライダーと棒）。記号どうしの範囲（k ≦ n）に合わせて丸める ----
  // 最初の値：渡された値か、定義域から決める（整数は 10 前後、0〜1 は 0.3、ほかは中ほど）。横軸の記号は期待値の近く
  const start = useMemo(() => {
    const v: Record<string, number> = { ...initial };
    for (const k of vary) {
      if (v[k] !== undefined) continue;
      const sym = symOf(k); if (!sym) continue;
      const r = sliderRange(sym, v, FALLBACK);
      v[k] = sym.domain?.integer ? Math.min(r.max, Math.max(r.min, 10)) : r.min >= 0 && r.max <= 1 ? 0.3 : Number(((r.min + r.max) / 2).toFixed(2));
    }
    if (v[over] === undefined) {
      const m = mean?.tree ? evaluate(rhsOf(mean.tree), { values: v }) : undefined;
      const r = symOf(over) ? sliderRange(symOf(over)!, v, FALLBACK) : { min: 0, max: 0, step: 1 };
      v[over] = Math.min(r.max, Math.max(r.min, Math.round(m ?? r.min)));
    }
    return v;
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<Record<string, number>>(start);
  const clampAll = (v: Record<string, number>) => {
    const out = { ...v };
    for (const k of [...vary, over]) { const sym = symOf(k); if (!sym) continue; const r = sliderRange(sym, out, FALLBACK); out[k] = Math.min(r.max, Math.max(r.min, out[k] ?? r.min)); }
    return out;
  };
  const set = (k: string, x: number) => setValues((v) => clampAll({ ...v, [k]: x }));

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
  const html = useMemo(() => render(toTex(tree, {
    symbols,
    wrap: (k, t) => `\\htmlData{sym=${k}}{${t}}`,
    mark: (n) => opened.marks.get(n),
    data: (n) => (partNodes.has(n) ? `part=${partNodes.get(n)}` : undefined),
  })), [tree, symbols, opened, partNodes]);
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

  // ---- 値 ----
  const env = { values };
  const result = evaluate(rhsOf(tree), env);
  const lhs = lhsOf(tree);
  const overSym = symOf(over);
  const range = overSym ? sliderRange(overSym, values, FALLBACK) : { min: 0, max: 0, step: 1 };
  const dist = useMemo(() => distribution(original.tree!, over, range.min, range.max, env), [original.tree, over, range.min, range.max, JSON.stringify(values)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const meanValue = mean?.tree ? evaluate(rhsOf(mean.tree), env) : undefined;
  // ---- 実験（#102）：理論の分布から種つき乱数で1回ずつ引き、結果を同じ図に積み上げる。条件（n・p）を変えたら記録を分ける ----
  const [seed, setSeed] = useState(() => seed0 ?? (Date.now() % 100000));
  const rng = useRef(createRandom(seed));
  const [rec, setRec] = useState(emptyRecord);
  const [lastDraw, setLastDraw] = useState<number | null>(null);
  const cond = JSON.stringify(vary.map((k) => values[k]));
  useEffect(() => { stop(); setRec(emptyRecord()); setLastDraw(null); }, [cond]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 100回は10回ずつ続けて引き、点が棒に近づいていくのを見せる（同じ種なら一度に引いたのと同じ結果）。1回は玉が落ちる
  const stream = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (stream.current) { clearInterval(stream.current); stream.current = null; } };
  useEffect(() => stop, []);
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
    const tick = () => {
      const m = Math.min(per, count - done);
      cur = runTrials(rng.current, d0, m, cur); done += m; setRec(cur);
      if (done >= count) stop();
    };
    tick();
    stream.current = setInterval(tick, 45);
  };;
  const clearRec = () => { stop(); const s2 = Date.now() % 100000; setSeed(s2); rng.current = createRandom(s2); setRec(emptyRecord()); setLastDraw(null); };
  const freq = frequencies(rec);

  // 計算過程：右辺に今の値を入れて1段ずつ（252 × 0.5⁵ × 0.5⁵ ＝ 0.2461）。最初は「値を入れた式」の段
  const steps = useMemo(() => expand(tree, env), [tree, JSON.stringify(values)]);   // 開いた式（₁₀C₃ を 10!/(3!7!) に）で計算の段を作る   // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState(1);
  const shownStep = Math.min(step, steps.length - 1);
  const isProb = lhs && "op" in lhs && lhs.op === "fn" && lhs.name === "P";
  // 初期値に戻すときは実験のタイマーも止める（止めないと、消した記録を次の更新が書き戻す。#142）
  const reset = () => { stop(); snapshot(); setValues(start); setOpens([]); setSel(null); setStep(1); setRec(emptyRecord()); setLastDraw(null); };

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
  const openKeys = [...new Set(opened.marks.values())];
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
    if (!sel) return <div className={`${s.strip} ${s.stripEmpty}`} data-testid="ws-strip"><p className={s.hint}>式のかたまり（ₙCₖ・pᵏ など）を押すと、意味と今の値がここに出る。</p></div>;
    const p = sel.part !== undefined ? parts[sel.part] : undefined;
    const node = p ? nodeAt(tree, p.path) : undefined;
    // この中の記号：値の記号（n・k・p）と、意味のある関数（ₙCₖ・k!）。関数は「分解する」で定義の式に開ける
    const fns = node ? fnsIn(node).filter((k) => symOf(k, symbols)) : [];
    const inside = node ? [...fns, ...symbolsIn(node).filter((k) => symOf(k, symbols))] : [];
    const breakable = fns.map((k) => ({ key: k, defs: choicesFor(k) })).filter((x) => x.defs.length > 0);
    const foldable = node ? marksIn(node) : [];
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

  // ---- 分布の図：理論＝棒、実験＝点（同じ縦軸）、期待値＝点線。目盛りは確率の切りのよい値 ----
  const W = 340, TOP = 18, BASE = 118, H = BASE + 26, LEFT = 0, RIGHT = 34;
  const empMax = rec.values.length ? Math.max(0, ...dist.map((d) => freq.get(d.x) ?? 0)) : 0;
  const rawMax = Math.max(1e-9, ...dist.map((d) => d.y ?? 0), empMax);
  const tick = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => rawMax / t <= 4) ?? 1;
  const yMax = Math.max(tick, Math.ceil(rawMax / tick - 1e-9) * tick);
  // 形・目盛りが変わるときは前の形から動かす（n・p を動かすと山が滑って変わる）
  const [yMaxT] = useTween([yMax]);
  const ys = useTween(dist.map((d) => d.y ?? 0));
  const yPos = (v: number) => BASE - (v / yMaxT!) * (BASE - TOP);
  const bw = (W - LEFT - RIGHT) / Math.max(1, dist.length);
  const xPos = (x: number) => LEFT + (x - range.min + 0.5) * bw;
  const barW = Math.max(2, bw - Math.max(3, bw * 0.38));
  const every = dist.length <= 13 ? 1 : dist.length <= 31 ? 5 : 10;
  const cur = values[over];
  const chooseX = (x: number) => { haptic(); set(over, x); };
  const pct = (v: number) => `${Number((v * 100).toFixed(v < 0.1 ? 1 : 0))}%`;
  const barPath = (x: number, y: number) => {
    const l = x - barW / 2, r = Math.min(3, barW / 2, BASE - y);
    return `M${l},${BASE}V${y + r}Q${l},${y} ${l + r},${y}H${l + barW - r}Q${l + barW},${y} ${l + barW},${y + r}V${BASE}Z`;
  };
  const symText = overSym?.symbol ?? over;

  return (
    <section className={s.ws} data-testid="workspace" aria-label="式の作業台">
      <div className={s.head}><b>{original.label ?? "式を動かす"}</b>
        <button type="button" className={s.reset} onClick={reset} data-testid="ws-reset">初期値に戻す</button></div>
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
      <div className={s.result} data-testid="ws-result">
        <span className={s.resultLhs} dangerouslySetInnerHTML={{ __html: lhs ? render(toTex(substitute(lhs, { values: { [over]: values[over]! } }), { symbols }), false) : "" }} />
        <Tween className={s.resultVal} v={result} show={(x) => (isProb && x !== undefined ? `${(x * 100).toFixed(2)}%` : fmt(x))} />
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
          <div className={s.calcTex} dangerouslySetInnerHTML={{ __html: render(`${toTex(steps[shownStep]!, { symbols, num: short })}${shownStep < steps.length - 1 ? `=${toTex(steps[steps.length - 1]!, { symbols, num: short })}` : ""}`, false) }} />
        </div>
      )}
      <div className={s.sliders}>
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
      </div>
      <figure className={s.chart} aria-label={`${symText} ごとの確率`}>
        <figcaption className={s.chartHead}>
          <b>{overSym?.meaning.split("（")[0] ?? over} {symText} ごとの確率</b>
          <span className={s.legend}>
            <span><i className={s.keyBar} />理論</span>
            {rec.values.length > 0 && <span><i className={s.keyDot} />実験 {rec.values.length} 回</span>}
            {meanValue !== undefined && <span><i className={s.keyMean} />期待値 {fmt(meanValue, 2)}</span>}
          </span>
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img">
          {Array.from({ length: Math.round(yMax / tick) }, (_, i) => (i + 1) * tick).map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={W - RIGHT + 4} y1={yPos(t)} y2={yPos(t)} className={s.grid} />
              <text x={W - 2} y={yPos(t) + 3.5} className={s.yTick} textAnchor="end">{pct(t)}</text>
            </g>
          ))}
          {dist.map((d, i) => {
            const on = d.x === cur, y = yPos(ys[i] ?? 0);
            return (
              <g key={d.x} className={s.barG} onClick={() => chooseX(d.x)} data-testid={`ws-bar-${d.x}`} aria-label={`${symText}＝${d.x}：${fmt(d.y)}`}>
                <rect x={xPos(d.x) - bw / 2} y={0} width={bw} height={H} className={s.hit} />
                {BASE - y > 0.3 && <path d={barPath(xPos(d.x), y)} className={on ? s.barOn : s.bar} />}
              </g>
            );
          })}
          <line x1={LEFT} x2={W - RIGHT + 4} y1={BASE} y2={BASE} className={s.base} />
          {meanValue !== undefined && meanValue >= range.min && meanValue <= range.max && (
            <line x1={xPos(meanValue)} x2={xPos(meanValue)} y1={TOP - 6} y2={BASE} className={s.mean} />
          )}
          {rec.values.length > 0 && dist.map((d) => (
            <circle key={d.x === lastDraw ? `e${d.x}-${rec.values.length}` : `e${d.x}`} cx={xPos(d.x)} cy={yPos(freq.get(d.x) ?? 0)} r={d.x === lastDraw ? 4 : 3}
              className={d.x === lastDraw ? `${s.emp} ${s.empJust}` : s.emp} data-testid={`ws-emp-${d.x}`}
              style={d.x === lastDraw ? ({ "--drop": `${TOP - 14 - yPos(freq.get(d.x) ?? 0)}px` } as React.CSSProperties) : undefined} />
          ))}
          {dist.map((d, i) => [d, ys[i] ?? 0] as const).filter(([d]) => d.x === cur).map(([d, yv]) => (
            <text key={`v${d.x}`} x={Math.min(W - RIGHT - 14, Math.max(LEFT + 14, xPos(d.x)))} y={Math.min(yPos(yv), rec.values.length ? yPos(freq.get(d.x) ?? 0) : BASE) - 8} className={s.valLabel} textAnchor="middle">{pct(d.y ?? 0)}</text>
          ))}
          {dist.map((d) => {
            const on = d.x === cur;
            if (!on && ((d.x - range.min) % every !== 0 || Math.abs(d.x - (cur ?? -99)) * bw < 16)) return null;
            return <text key={`t${d.x}`} x={xPos(d.x)} y={BASE + 15} className={on ? s.xTickOn : s.xTick} textAnchor="middle">{d.x}</text>;
          })}
        </svg>
      </figure>
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
            ? <>実験 <b>{rec.values.length}</b> 回{lastDraw !== null && <>（今回 {symText}＝<b>{lastDraw}</b>）</>}・平均 <b>{fmt(rec.mean, 2)}</b>{meanValue !== undefined && <>（理論 {fmt(meanValue, 2)}）</>}</>
            : <>まだ実験していない。回数を増やすと、点が棒の高さに近づくかを見る。</>}
        </p>
        <div className={s.expFoot}>
          <span>種 {seed}</span>
          <button type="button" className={s.clear} onClick={clearRec} disabled={!rec.values.length}>記録を消す</button>
        </div>
      </div>}
    </section>
  );
}
