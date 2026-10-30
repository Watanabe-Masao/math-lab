// 式の作業台（stats2-course #110）：数式・意味・操作・現象を1つの行動で連動させる。
// - 数式が主役。意味のかたまり（ₙCₖ・pᵏ・(1−p)ⁿ⁻ᵏ）を式の中で直接押す。押したかたまりは強調され、式の真下の帯に名前・意味・今の値が出る
// - 帯の中の記号を押すと、記号の意味・概念・「式の中で開く」（定義の式に置き換え。閉じれば戻る）
// - スライダー（範囲は定義域から。k ≦ n のような記号どうしの範囲も連動）を動かすと、式の値・結果・分布が一緒に動く
// - 分布の棒を押すと横軸の記号（k）が選ばれ、式の値と帯の値がその k になる
// 手本：渡辺さんの「FormulaNode 計算ツリー」（式の真下の帯・その場で展開・結果の二重線）。ここに実験（#102）と予想を足していく。
import katex from "katex";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyOpens, createRandom, definitionsFor, describeDomain, distribution, emptyRecord, evaluate, expand, formatNum, frequencies, lhsOf, nodeAt, runTrials, openSymbol, rhsOf, sliderRange, substitute, symbolsIn, toTex,
  type Definition, type Formula as EngineFormula, type FormulaNode, type FormulaPart, type FormulaSymbol,
} from "@math-lab/engine";
import { flash, haptic, reduced } from "./motion";
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

export function Workspace({ formula: original, mean, vary, over, initial, seed: seed0, definitions, onConcept, conceptName }: Props) {
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
  useEffect(() => { setRec(emptyRecord()); setLastDraw(null); }, [cond]);
  const run = (count: number) => {
    haptic();
    const r = runTrials(rng.current, dist, count, rec);
    setRec(r); setLastDraw(count === 1 ? r.values[r.values.length - 1]! : null);
  };
  const clearRec = () => { const s2 = Date.now() % 100000; setSeed(s2); rng.current = createRandom(s2); setRec(emptyRecord()); setLastDraw(null); };
  const freq = frequencies(rec);

  // 計算過程：右辺に今の値を入れて1段ずつ（252 × 0.5⁵ × 0.5⁵ ＝ 0.2461）。最初は「値を入れた式」の段
  const steps = useMemo(() => expand(original.tree!, env), [original.tree, JSON.stringify(values)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState(1);
  const shownStep = Math.min(step, steps.length - 1);
  const isProb = lhs && "op" in lhs && lhs.op === "fn" && lhs.name === "P";
  const reset = () => { snapshot(); setValues(start); setOpens([]); setSel(null); setStep(1); setRec(emptyRecord()); setLastDraw(null); };

  // ---- 開き方（選んだ記号） ----
  const selSym = sel?.sym ? symOf(sel.sym, symbols) : undefined;
  const choices = useMemo(() => {
    if (!selSym?.concept || !definitions) return [];
    return definitionsFor(selSym.key, toEngine(definitions(selSym.concept))).filter((d) => openSymbol(tree, symbols, selSym.key, d, new Map(), { resolve }).count > 0);
  }, [selSym, definitions, tree, symbols, resolve]);
  const open = (d: Definition) => { snapshot(selSym!.key); setOpens((o) => [...o, { key: selSym!.key, def: d }]); setSel(null); };
  const pickSym = (k: string) => { haptic(); setSel((x) => ({ part: x?.part, sym: x?.sym === k ? undefined : k })); };
  const openKeys = [...new Set(opened.marks.values())];
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
    const inside = node ? symbolsIn(node).filter((k) => symOf(k, symbols)) : [];
    const v = selSym ? values[selSym.key] : undefined;
    return (
      <div className={s.strip} data-testid="ws-strip">
        {p && node && (
          <div className={s.ctx} key={`p${sel.part}`}>
            <span className={s.ctxTex} dangerouslySetInnerHTML={{ __html: render(toTex(node, { symbols }), false) }} />
            <span className={s.ctxVal} data-testid="ws-part-value">{fmt(evaluate(node, env))}</span>
            <b className={s.ctxName}>{p.name}</b>
            {!selSym && <p className={s.ctxText}>{p.meaning}</p>}
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
  const W = 340, TOP = 18, BASE = 118, H = BASE + 26, LEFT = 4, RIGHT = 34;
  const empMax = rec.values.length ? Math.max(0, ...dist.map((d) => freq.get(d.x) ?? 0)) : 0;
  const rawMax = Math.max(1e-9, ...dist.map((d) => d.y ?? 0), empMax);
  const tick = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => rawMax / t <= 4) ?? 1;
  const yMax = Math.max(tick, Math.ceil(rawMax / tick - 1e-9) * tick);
  const yPos = (v: number) => BASE - (v / yMax) * (BASE - TOP);
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
      <div ref={stage} className={s.stage} onClick={onStage} dangerouslySetInnerHTML={{ __html: html }} data-testid="ws-formula" />
      {strip()}
      {openKeys.length > 0 && (
        <div className={s.tools}>
          {openKeys.map((k) => <button key={k} type="button" className={s.tool} onClick={() => close(k)} data-testid={`ws-close-${k}`}>{symOf(k, symbols)?.symbol ?? k} をたたむ</button>)}
          {opens.length > 1 && <button type="button" className={s.tool} onClick={() => { snapshot(); setOpens([]); }}>元の式に戻す</button>}
        </div>
      )}
      <div className={s.result} data-testid="ws-result">
        <span className={s.resultLhs} dangerouslySetInnerHTML={{ __html: lhs ? render(toTex(substitute(lhs, { values: { [over]: values[over]! } }), { symbols }), false) : "" }} />
        <span className={s.resultVal}>{isProb && result !== undefined ? `${(result * 100).toFixed(2)}%` : fmt(result)}</span>
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
          {dist.map((d) => {
            const on = d.x === cur, y = yPos(d.y ?? 0);
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
            <circle key={`e${d.x}`} cx={xPos(d.x)} cy={yPos(freq.get(d.x) ?? 0)} r={d.x === lastDraw ? 4 : 3}
              className={d.x === lastDraw ? `${s.emp} ${s.empJust}` : s.emp} data-testid={`ws-emp-${d.x}`} />
          ))}
          {dist.filter((d) => d.x === cur).map((d) => (
            <text key="v" x={Math.min(W - RIGHT - 14, Math.max(LEFT + 14, xPos(d.x)))} y={Math.min(yPos(d.y ?? 0), rec.values.length ? yPos(freq.get(d.x) ?? 0) : BASE) - 8} className={s.valLabel} textAnchor="middle">{pct(d.y ?? 0)}</text>
          ))}
          {dist.map((d) => {
            const on = d.x === cur;
            if (!on && ((d.x - range.min) % every !== 0 || Math.abs(d.x - (cur ?? -99)) * bw < 16)) return null;
            return <text key={`t${d.x}`} x={xPos(d.x)} y={BASE + 15} className={on ? s.xTickOn : s.xTick} textAnchor="middle">{d.x}</text>;
          })}
        </svg>
      </figure>
      <div className={s.exp} data-testid="ws-exp">
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
      </div>
    </section>
  );
}
