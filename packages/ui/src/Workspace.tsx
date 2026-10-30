// 式の作業台（stats2-course #110）：数式・意味・操作・現象を1つの行動で連動させる。
// - 数式が主役。意味のかたまり（ₙCₖ・pᵏ・(1−p)ⁿ⁻ᵏ）を式の中で直接押す。押したかたまりは強調され、式の真下の帯に名前・意味・今の値が出る
// - 帯の中の記号を押すと、記号の意味・概念・「式の中で開く」（定義の式に置き換え。閉じれば戻る）
// - スライダー（範囲は定義域から。k ≦ n のような記号どうしの範囲も連動）を動かすと、式の値・結果・分布が一緒に動く
// - 分布の棒を押すと横軸の記号（k）が選ばれ、式の値と帯の値がその k になる
// 手本：渡辺さんの「FormulaNode 計算ツリー」（式の真下の帯・その場で展開・結果の二重線）。ここに実験（#102）と予想を足していく。
import katex from "katex";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyOpens, definitionsFor, describeDomain, distribution, evaluate, expand, lhsOf, nodeAt, openSymbol, rhsOf, sliderRange, substitute, symbolsIn, toTex,
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
  definitions?: (conceptId: string) => FormulaData[];
  onConcept?: (id: string) => void;
  conceptName?: (id: string) => string;
};

const render = (tex: string, display = true) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, output: "html", trust: (c) => c.command === "\\htmlData" }); }
  catch { return tex; }
};
const fmt = (v: number | undefined, d = 4) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(d))));
const toEngine = (fs: FormulaData[]): EngineFormula[] => fs.filter((x) => !!x.tree).map((x) => ({ symbols: x.symbols ?? [], tree: x.tree! }));
const FALLBACK = { min: 0, max: 30, step: 0.01 };

type Sel = { kind: "part"; index: number } | { kind: "sym"; key: string } | null;

export function Workspace({ formula: original, mean, vary, over, initial, definitions, onConcept, conceptName }: Props) {
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

  // ---- 選択 ----
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
    root.querySelectorAll<HTMLElement>("[data-part]").forEach((el) => el.toggleAttribute("data-on", sel?.kind === "part" && el.dataset.part === String(sel.index)));
    root.querySelectorAll<HTMLElement>("[data-sym]").forEach((el) => el.toggleAttribute("data-on", sel?.kind === "sym" && el.dataset.sym === sel.key));
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
    // かたまりの中なら、まずかたまりを選ぶ。選んだかたまりの中をもう一度押すと、その記号を選ぶ
    if (part && !(sel?.kind === "part" && sel.index === Number(part.dataset.part) && sym)) setSel({ kind: "part", index: Number(part.dataset.part) });
    else if (sym?.dataset.sym) setSel({ kind: "sym", key: sym.dataset.sym });
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
  // 計算過程：右辺に今の値を入れて1段ずつ（252 × 0.5⁵ × 0.5⁵ ＝ 0.2461）。最初は「値を入れた式」の段
  const steps = useMemo(() => expand(original.tree!, env), [original.tree, JSON.stringify(values)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState(1);
  const shownStep = Math.min(step, steps.length - 1);
  const isProb = lhs && "op" in lhs && lhs.op === "fn" && lhs.name === "P";
  const reset = () => { snapshot(); setValues(start); setOpens([]); setSel(null); setStep(1); };

  // ---- 開き方（選んだ記号） ----
  const selSym = sel?.kind === "sym" ? symOf(sel.key, symbols) : undefined;
  const choices = useMemo(() => {
    if (!selSym?.concept || !definitions) return [];
    return definitionsFor(selSym.key, toEngine(definitions(selSym.concept))).filter((d) => openSymbol(tree, symbols, selSym.key, d, new Map(), { resolve }).count > 0);
  }, [selSym, definitions, tree, symbols, resolve]);
  const open = (d: Definition) => { snapshot(selSym!.key); setOpens((o) => [...o, { key: selSym!.key, def: d }]); setSel(null); };
  const openKeys = [...new Set(opened.marks.values())];
  const close = (k: string) => { snapshot(); setOpens((o) => {
    const kept: typeof o = []; let cur = { tree: original.tree!, symbols: baseSymbols };
    for (const x of o.filter((x) => x.key !== k)) { const r = openSymbol(cur.tree, cur.symbols, x.key, x.def, new Map(), { resolve }); if (r.count) { kept.push(x); cur = r; } }
    return kept;
  }); };

  // ---- 帯 ----
  const strip = () => {
    if (sel?.kind === "part") {
      const p = parts[sel.index]!, node = nodeAt(tree, p.path)!;
      const inside = symbolsIn(node).filter((k) => symOf(k, symbols));
      return (
        <div className={s.strip} data-testid="ws-strip" key={`p${sel.index}`}>
          <div className={s.stripRow}>
            <span className={s.stripTex} dangerouslySetInnerHTML={{ __html: render(toTex(node, { symbols }), false) }} />
            <div className={s.stripText}><b>{p.name}</b><p>{p.meaning}</p></div>
            <span className={s.stripVal} data-testid="ws-part-value">{fmt(evaluate(node, env))}</span>
          </div>
          {inside.length > 0 && (
            <div className={s.stripFoot}>
              <span className={s.muted}>この中の記号</span>
              {inside.map((k) => <button key={k} type="button" className={s.mini} onClick={() => setSel({ kind: "sym", key: k })}>{symOf(k, symbols)!.symbol}</button>)}
            </div>
          )}
        </div>
      );
    }
    if (sel?.kind === "sym" && selSym) {
      const v = values[selSym.key];
      return (
        <div className={s.strip} data-testid="ws-strip" key={`s${selSym.key}`}>
          <div className={s.stripRow}>
            <span className={s.stripBig}>{selSym.symbol}</span>
            <div className={s.stripText}><b>{selSym.meaning}</b>{selSym.domain && <p>{describeDomain(selSym.domain, symbols)}</p>}</div>
            {v !== undefined && <span className={s.stripVal}>{fmt(v)}</span>}
          </div>
          {(choices.length > 0 || (selSym.concept && onConcept)) && (
            <div className={s.stripFoot}>
              {choices.map((d, i) => (
                <button key={i} type="button" className={s.act} onClick={() => open(d)} data-testid="ws-open">
                  式の中で開く{choices.length > 1 ? `（形${i + 1}）` : ""}
                  <span dangerouslySetInnerHTML={{ __html: render(toTex((d.formula.tree as { args: FormulaNode[] }).args[d.side]!, { symbols: d.formula.symbols }), false) }} />
                </button>
              ))}
              {selSym.concept && onConcept && <button type="button" className={s.link} onClick={() => onConcept(selSym.concept!)}>{conceptName?.(selSym.concept) ?? selSym.concept} へ →</button>}
            </div>
          )}
        </div>
      );
    }
    return <div className={s.strip} data-testid="ws-strip"><p className={s.hint}>式のかたまりを押すと、意味と今の値がここに出る。</p></div>;
  };

  // ---- 分布の図 ----
  const W = 340, H = 140, PAD = 18;
  const maxY = Math.max(1e-9, ...dist.map((d) => d.y ?? 0));
  const bw = (W - PAD * 2) / Math.max(1, dist.length);
  const xPos = (x: number) => PAD + (x - range.min + 0.5) * bw;
  const chooseX = (x: number) => { haptic(); set(over, x); };

  return (
    <section className={s.ws} data-testid="workspace" aria-label="式の作業台">
      <div className={s.head}><span className={s.eyebrow}>作業台</span>{original.label && <b>{original.label}</b>}
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
        <span dangerouslySetInnerHTML={{ __html: lhs ? render(toTex(substitute(lhs, { values: { [over]: values[over]! } }), { symbols }), false) : "" }} />
        <span className={s.resultVal}>{isProb && result !== undefined ? `${(result * 100).toFixed(2)}%` : fmt(result)}{isProb && <small className={s.resultSub}>{fmt(result, 5)}</small>}</span>
      </div>
      {steps.length > 1 && (
        <div className={s.calc} data-testid="ws-calc">
          <span className={s.muted}>計算過程</span>
          <div className={s.calcTex} dangerouslySetInnerHTML={{ __html: render(`${toTex(steps[shownStep]!, { symbols })}${shownStep < steps.length - 1 ? `=${toTex(steps[steps.length - 1]!, { symbols })}` : ""}`, false) }} />
          <div className={s.calcNav}>
            <button type="button" className={s.tool} onClick={() => setStep(Math.max(1, shownStep - 1))} disabled={shownStep <= 1} aria-label="前の段">◀</button>
            <span className={s.muted}>{shownStep}／{steps.length - 1}</span>
            <button type="button" className={s.tool} onClick={() => setStep(Math.min(steps.length - 1, shownStep + 1))} disabled={shownStep >= steps.length - 1} aria-label="次の段">▶</button>
          </div>
        </div>
      )}
      <div className={s.sliders}>
        {[...vary, over].map((k) => {
          const sym = symOf(k); if (!sym) return null;
          const r = sliderRange(sym, values, FALLBACK);
          return (
            <label key={k} className={s.slider}>
              <span className={s.sliderHead}><span>{sym.meaning.split("（")[0]} <i>{sym.symbol}</i></span><b>{fmt(values[k], 2)}</b></span>
              <input type="range" min={r.min} max={r.max} step={r.step} value={values[k]} onChange={(e) => set(k, Number(e.target.value))} aria-label={`${sym.symbol}（${sym.meaning}）`} data-testid={`ws-slider-${k}`} />
            </label>
          );
        })}
      </div>
      <figure className={s.chart} aria-label={`${overSym?.symbol ?? over} ごとの値`}>
        <figcaption className={s.chartHead}>
          <span>{overSym?.meaning.split("（")[0] ?? over} ごとの確率</span>
          {meanValue !== undefined && <span className={s.muted}>期待値 {fmt(meanValue, 2)}</span>}
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H + 22}`} className={s.svg} role="img">
          {dist.map((d) => {
            const h = ((d.y ?? 0) / maxY) * (H - 12), on = d.x === values[over];
            return (
              <g key={d.x} className={s.barG} onClick={() => chooseX(d.x)} data-testid={`ws-bar-${d.x}`} aria-label={`${overSym?.symbol ?? over}＝${d.x}：${fmt(d.y)}`}>
                <rect x={xPos(d.x) - bw / 2} y={0} width={bw} height={H} className={s.hit} />
                <rect x={xPos(d.x) - bw * 0.38} y={H - (H - 12)} width={bw * 0.76} height={H - 12} rx={Math.min(4, bw * 0.2)}
                  className={on ? s.barOn : s.bar} style={{ transform: `scaleY(${(h / (H - 12)) || 0})` }} />
              </g>
            );
          })}
          {meanValue !== undefined && meanValue >= range.min && meanValue <= range.max && (
            <path d={`M ${xPos(meanValue)} ${H + 2} l -5 8 h 10 z`} className={s.mean} />
          )}
          <text x={PAD} y={H + 20} className={s.axis}>{range.min}</text>
          <text x={W - PAD} y={H + 20} className={s.axis} textAnchor="end">{range.max}</text>
        </svg>
        <p className={s.hint}>棒を押すと {overSym?.symbol ?? over} が選ばれ、式の値がその確率になる。スライダーを動かすと形が変わる。</p>
      </figure>
    </section>
  );
}
