// 式を触る部品（#72）：式は覚えるものではなく、触って確かめるもの。
// - 式の記号（μ・σ・E など）を押すと、意味・範囲・今の値・概念が出る。記号は小さいので、下に同じ記号を押せる札でも並べる（44px）
// - 値を入れると（実験の値・自分で入れた値）、右辺を1段ずつ計算して見せる（E(X)＝np → 10×0.3 → 3）
// - 記号が概念を指していれば、その概念へ開ける（地図とつながる）
// 式は木（tree）から作る。木がない式は、元の TeX をそのまま出す（押せない）。
import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";
import { expand, symbolsIn, toTex, type FormulaNode, type FormulaSymbol } from "@math-lab/engine";
import { Button } from "./Button";
import { change } from "./motion";
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
};

const KIND: Record<string, string> = { value: "値", data: "データ", rv: "確率変数", param: "母数", index: "添え字", const: "定数" };
const render = (tex: string, display = true) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, output: "html", trust: (c) => c.command === "\\htmlData" }); }
  catch { return tex; }
};
const fmt = (v: number) => String(Number(v.toPrecision(6)));

export function Formula({ formula: f, values, editable = false, onConcept, conceptName }: Props) {
  const symbols = f.symbols ?? [];
  const [on, setOn] = useState<string | null>(null);
  const [own, setOwn] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const steps = useRef<HTMLDivElement>(null);

  const html = useMemo(() => render(f.tree ? toTex(f.tree, { symbols, wrap: (k, t) => `\\htmlData{sym=${k}}{${t}}` }) : f.tex ?? ""), [f, symbols]);
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

  const pick = (k: string) => setOn((cur) => (cur === k ? null : k));
  const sel = on ? symbols.find((x) => x.key === on) : undefined;
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
          {sel.concept && onConcept && <Button variant="link" onClick={() => onConcept(sel.concept!)}>{conceptName?.(sel.concept) ?? sel.concept} を開く →</Button>}
        </div>
      )}
      {editable && !values && inputs.length > 0 && (
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
