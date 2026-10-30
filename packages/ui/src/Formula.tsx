// 式を触る部品（#72）：式は覚えるものではなく、触って確かめるもの。
// - 式の記号（μ・σ・E など）を押すと、意味・範囲・今の値・概念が出る。記号は小さいので、下に同じ記号を押せる札でも並べる（44px）
// - 値を入れると（実験の値・自分で入れた値。自分で入れる欄は「値を入れて計算する」を押したときだけ出す）、右辺を1段ずつ計算して見せる（E(X)＝np → 10×0.3 → 3）
// - 記号が概念を指していれば、その概念へ開ける（地図とつながる）
// - 記号を「開く」と、その記号の定義の式に置き換わる（σ → √V(X) → √E((X−μ)²)）。開いた所は一度だけ淡く光り、「閉じる」で戻る
// 式は木（tree）から作る。木がない式は、元の TeX をそのまま出す（押せない）。
import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyOpens, definitionsFor, expand, openSymbol, symbolsIn, toTex, type Definition, type Formula as EngineFormula, type FormulaNode, type FormulaSymbol } from "@math-lab/engine";
import { Button } from "./Button";
import { change, flash } from "./motion";
import s from "./Formula.module.css";

export type FormulaData = { tex?: string; label?: string; symbols?: FormulaSymbol[]; tree?: FormulaNode };

type Props = {
  formula: FormulaData;
  /** 記号の今の値（実験室から渡す）。渡すと展開が出る */
  values?: Record<string, number>;
  /** 値を自分で入れられるようにする（母数・値・定数の記号だけ） */
  editable?: boolean;
  /** 記号が指す概念を開く */
  onConcept?: (id: string) => void;
  /** 概念の名前（ボタンの文字に使う） */
  conceptName?: (id: string) => string;
  /** 概念の式（記号を定義で開くときに使う。渡さなければ開けない） */
  definitions?: (conceptId: string) => FormulaData[];
};

const KIND: Record<string, string> = { value: "値", data: "データ", rv: "確率変数", param: "母数", index: "添え字", const: "定数" };
const render = (tex: string, display = true) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, output: "html", trust: (c) => c.command === "\\htmlData" }); }
  catch { return tex; }
};
const fmt = (v: number) => String(Number(v.toPrecision(6)));

export function Formula({ formula: original, values, editable = false, onConcept, conceptName, definitions }: Props) {
  const [opens, setOpens] = useState<{ key: string; def: Definition }[]>([]);
  const opened = useMemo(() => (original.tree ? applyOpens({ symbols: original.symbols ?? [], tree: original.tree }, opens) : null), [original, opens]);
  const f: FormulaData = opened ? { ...original, tree: opened.tree, symbols: opened.symbols } : original;
  const symbols = f.symbols ?? [];
  const [on, setOn] = useState<string | null>(null);
  const [own, setOwn] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [try_, setTry] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const steps = useRef<HTMLDivElement>(null);

  const html = useMemo(() => render(f.tree ? toTex(f.tree, { symbols, wrap: (k, t) => `\\htmlData{sym=${k}}{${t}}`, mark: (n) => opened?.marks.get(n) }) : f.tex ?? ""), [f.tree, f.tex, symbols, opened]);
  // 記号の札：式に出てくる順。木がなければ symbols の順
  const order = useMemo(() => {
    if (!f.tree) return symbols;
    const seen = symbolsIn(f.tree);
    const fns: string[] = [];
    const walk = (n: FormulaNode) => { if ("op" in n) { if (n.op === "fn" && n.name && !fns.includes(n.name)) fns.push(n.name); n.args.forEach(walk); } };
    walk(f.tree);
    const keys = [...fns, ...seen];
    return keys.map((k) => symbols.find((x) => x.key === k)).filter((x): x is FormulaSymbol => !!x);
  }, [f.tree, symbols]);

  // 値を入れられる記号：右辺に出てくる母数・値・定数（e・π は入れなくてよい）
  const rhs = f.tree && "op" in f.tree && f.tree.op === "eq" ? f.tree.args[f.tree.args.length - 1]! : f.tree;
  const inputs = useMemo(() => (rhs ? symbolsIn(rhs) : []).map((k) => symbols.find((x) => x.key === k)).filter((x): x is FormulaSymbol => !!x && ["param", "value", "const"].includes(x.kind ?? "") && !["e", "pi"].includes(x.key)), [rhs, symbols]);
  const vals = { ...own, ...values };
  const expansion = useMemo(() => (f.tree && Object.keys(vals).length ? expand(f.tree, { values: vals }) : []), [f.tree, JSON.stringify(vals)]);
  const lhs = f.tree && "op" in f.tree && f.tree.op === "eq" ? toTex(f.tree.args[0]!, { symbols }) : "";
  useEffect(() => setStep(Math.max(0, expansion.length - 1)), [expansion.length]);

  // 選んだ記号を式の中でも強調する
  useEffect(() => {
    box.current?.querySelectorAll<HTMLElement>("[data-sym]").forEach((el) => el.toggleAttribute("data-on", el.dataset.sym === on));
  }, [on, html]);

  // 開いた所を一度だけ淡く光らせる
  const last = opens[opens.length - 1]?.key;
  useEffect(() => { if (last) box.current?.querySelectorAll(`[data-open="${last}"]`).forEach((el) => flash(el)); }, [opens.length, last]);

  const pick = (k: string) => setOn((cur) => (cur === k ? null : k));
  // 選んだ記号の開き方（その記号の概念の式のうち、左辺が同じ記号・関数のもの。今の式の中で開けるものだけ）
  const sel0 = on ? symbols.find((x) => x.key === on) : undefined;
  const choices = useMemo(() => {
    if (!on || !f.tree || !sel0?.concept || !definitions) return [];
    const forms = definitions(sel0.concept).filter((x): x is EngineFormula & FormulaData => !!x.tree).map((x) => ({ symbols: x.symbols ?? [], tree: x.tree! }));
    return definitionsFor(on, forms).filter((d) => openSymbol(f.tree!, symbols, on, d).count > 0);
  }, [on, f.tree, sel0, definitions, symbols]);
  // 今の式の中に開いた所が残っている記号（σ を閉じると、その中で開いた V も見えなくなる）
  const openKeys = [...new Set(opened ? [...opened.marks.values()] : [])];
  const open = (d: Definition) => change(box.current, () => { setOpens((o) => [...o, { key: on!, def: d }]); setStep(0); setOn(null); });   // 開いた記号は式から消えるので、カードも閉じる
  // 閉じる：その記号の開きを外し、外したことで開く所がなくなった手順も落とす（σ を閉じたら、その中の V の開きも消える）
  const close = (k: string) => change(box.current, () => setOpens((o) => {
    if (!original.tree) return [];
    const kept: typeof o = [];
    let cur = { tree: original.tree, symbols: original.symbols ?? [] };
    for (const x of o.filter((x) => x.key !== k)) { const r = openSymbol(cur.tree, cur.symbols, x.key, x.def); if (r.count) { kept.push(x); cur = r; } }
    return kept;
  }));
  const sel = sel0;
  const go = (i: number) => change(steps.current, () => setStep(i));

  return (
    <div className={s.formula} data-testid="formula">
      {f.label && <h4 className={s.label}>{f.label}</h4>}
      <div ref={box} className={`${s.tex}${f.tree ? ` ${s.live}` : ""}`} onClick={(e) => { const el = (e.target as HTMLElement).closest<HTMLElement>("[data-sym]"); if (el?.dataset.sym) pick(el.dataset.sym); }}
        dangerouslySetInnerHTML={{ __html: html }} />
      {order.length > 0 && (
        <div className={s.chips} role="group" aria-label="記号">
          {order.map((x) => (
            <button key={x.key} type="button" className={s.chip} aria-pressed={on === x.key} onClick={() => pick(x.key)} data-testid={`sym-${x.key}`}>{x.symbol}</button>
          ))}
        </div>
      )}
      {sel && (
        <div className={s.card} data-testid="sym-card">
          <div className={s.cardHead}><b>{sel.symbol}</b>{sel.kind && <span className={s.kind}>{KIND[sel.kind]}</span>}</div>
          <p className={s.meaning}>{sel.meaning}</p>
          {sel.range && <p className={s.sub}>範囲：{sel.range}</p>}
          {vals[sel.key] !== undefined && <p className={s.sub}>今の値：<b>{fmt(vals[sel.key]!)}</b></p>}
          {choices.length > 0 && (
            <div className={s.opens}>
              {choices.map((d, i) => (
                <button key={i} type="button" className={s.open} onClick={() => open(d)} data-testid="open-def">
                  <span className={s.openLabel}>{choices.length > 1 ? `開く（形${i + 1}）` : "開く"}</span>
                  <span dangerouslySetInnerHTML={{ __html: render(toTex((d.formula.tree as { args: FormulaNode[] }).args[d.side]!, { symbols: d.formula.symbols }), false) }} />
                </button>
              ))}
            </div>
          )}
          {sel.concept && onConcept && <Button variant="link" onClick={() => onConcept(sel.concept!)}>{conceptName?.(sel.concept) ?? sel.concept} を開く →</Button>}
        </div>
      )}
      {openKeys.length > 0 && (
        <div className={s.opened}>
          {openKeys.map((k) => (
            <Button key={k} variant="quiet" onClick={() => close(k)} data-testid={`close-${k}`}>{symbols.find((x) => x.key === k)?.symbol ?? k} を閉じる</Button>
          ))}
          {opens.length > 1 && <Button variant="quiet" onClick={() => change(box.current, () => setOpens([]))}>元の式に戻す</Button>}
        </div>
      )}
      {editable && !values && inputs.length > 0 && !try_ && (
        <Button variant="quiet" className={s.try} onClick={() => setTry(true)}>値を入れて計算する</Button>
      )}
      {editable && !values && inputs.length > 0 && try_ && (
        <div className={s.inputs}>
          {inputs.map((x) => (
            <label key={x.key} className={s.input}>
              <span>{x.symbol}</span>
              <input type="number" inputMode="decimal" step="any" aria-label={`${x.symbol}（${x.meaning}）`} value={own[x.key] ?? ""}
                onChange={(e) => setOwn((o) => { const n = { ...o }; if (e.target.value === "" || !Number.isFinite(Number(e.target.value))) delete n[x.key]; else n[x.key] = Number(e.target.value); return n; })} />
            </label>
          ))}
        </div>
      )}
      {expansion.length > 1 && (
        <div className={s.steps} data-testid="expansion">
          <div ref={steps} className={s.step} dangerouslySetInnerHTML={{ __html: render(`${lhs ? `${lhs}=` : ""}${toTex(expansion[step]!, { symbols })}`) }} />
          <div className={s.nav}>
            <Button onClick={() => go(step - 1)} disabled={step === 0} aria-label="前の段">◀</Button>
            <span className={s.count} aria-live="polite">{step + 1}／{expansion.length}</span>
            <Button onClick={() => go(step + 1)} disabled={step >= expansion.length - 1} aria-label="次の段">▶</Button>
          </div>
        </div>
      )}
    </div>
  );
}
