// 値の表の作業台（stats2-course #119）。重みを動かし、確率・寄与・期待値・Σを同じ表から更新する。
// 計算はengineだけ。棒の横位置は値の間隔に比例させ、期待値の▲を分布の重心として表示する。
import { useMemo, useState, type PointerEvent } from "react";
import { checkMechanism, expand, modelMoments, modelPmf, rhsOf, supportOf, toTex } from "@math-lab/engine";
import { Formula, type FormulaData } from "./Formula";
import { tex } from "./labParts";
import s from "./TableWorkspace.module.css";

export type ValueTable = { id: string; name: string; icon?: string; unit?: string; values: number[]; weights: number[]; labels?: string[] };
export type TableWorkspaceData = { formula: number; linear?: number; tables: ValueTable[] };
type Props = { tables: ValueTable[]; formula: FormulaData; linear?: FormulaData; onConcept?: (id: string) => void; conceptName?: (id: string) => string; definitions?: (id: string) => FormulaData[] };
const num = (x: number) => String(Number(x.toPrecision(6)));
const pct = (x: number) => `${num(100 * x)}%`;

export function TableWorkspace({ tables, ...rest }: Props) {
  const [chosen, choose] = useState(tables[0]?.id);
  const table = tables.find((t) => t.id === chosen) ?? tables[0];
  if (!table) return <p role="alert">値の表がない。</p>;
  const reason = checkMechanism({ kind: "table", n: 1, values: table.values, weights: table.weights });
  if (reason || table.weights.some((w) => !Number.isFinite(w)) || table.labels && table.labels.length !== table.values.length) return <p role="alert">値の表を開けない：{reason ?? "重みまたは呼び名が不正"}</p>;
  return <section className={s.workspace} aria-label="期待値の作業台" data-testid="table-workspace">
    <label className={s.select}>場面を選ぶ<select value={table.id} onChange={(e) => choose(e.target.value)}>
      {tables.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
    </select></label>
    <TableEditor key={table.id} table={table} {...rest} />
  </section>;
}

function TableEditor({ table, formula, linear, ...links }: Omit<Props, "tables"> & { table: ValueTable }) {
  const [weights, setWeights] = useState([...table.weights]);
  const [a, setA] = useState(1), [b, setB] = useState(0), [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const base = { kind: "table" as const, n: 1, values: table.values, weights };
  const original = modelMoments(base);
  const values = table.values.map((x) => a * x + b);
  const model = { ...base, values }, moment = modelMoments(model);
  const support = supportOf(model), probabilities = modelPmf(model);
  const total = weights.reduce((x, y) => x + y, 0);
  const rows = values.map((x, i) => ({ x, i, p: weights[i]! / total })).sort((x, y) => x.x - y.x || x.i - y.i);
  const maxWeight = Math.max(10, ...table.weights) * 4;
  const change = (i: number, next: number) => {
    const w = weights.map((x, j) => j === i ? Math.min(maxWeight, Math.max(0, next)) : x);
    if (w.every((x) => x === 0)) { setNotice("重みを全部0にはできない。どれか1つを増やしてから動かす。"); return; }
    setWeights(w); setNotice(""); setStep(0);
  };
  // Σは教材の木をengineで展開する。a＝0では同じ値を1つにまとめた確率を使う。
  const steps = useMemo(() => formula.tree ? expand(rhsOf(formula.tree), {
    domains: { x: support }, fns: { p: (x: number) => probabilities[support.indexOf(x)] ?? 0 },
  }) : [], [formula, support.join(","), probabilities.join(",")]);
  const shown = Math.min(step, Math.max(0, steps.length - 1));
  const reset = () => { setWeights([...table.weights]); setA(1); setB(0); setStep(0); setNotice(""); };
  const W = 340, L = 25, R = 315, TOP = 26, BASE = 145;
  // 線形変換の前後を同じ軸で見る。a＜0でも値順に並び、a＝0でも軸は退化しない。
  const lo = Math.min(...values), hi = Math.max(...values), pad = hi === lo ? 1 : (hi - lo) * .12;
  const min = lo - pad, max = hi + pad;
  const plotted = a === 0 ? [{ x: b, i: 0, p: 1, w: total }] : rows.map((r) => ({ ...r, w: weights[r.i]! }));
  const yMax = a === 0 ? Math.max(maxWeight, total) : maxWeight;
  const xpos = (x: number) => L + (x - min) / (max - min) * (R - L);
  const drag = (e: PointerEvent<SVGRectElement>, i: number) => {
    const svg = e.currentTarget.ownerSVGElement; if (!svg) return;
    const point = svg.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
    const matrix = svg.getScreenCTM(); if (!matrix) return;
    const y = point.matrixTransform(matrix.inverse()).y;
    change(i, Math.round((BASE - y) / (BASE - TOP) * maxWeight));
  };
  return <>
    <div className={s.head}><b>値と確率を動かす</b><button type="button" onClick={reset}>初期値に戻す</button></div>
    <p className={s.hint}>棒や下のつまみで重みを変える。重みを合計で割った値が確率になる。</p>
    <figure className={s.chart}>
      <figcaption>棒の高さは重み・▲は期待値</figcaption>
      <svg viewBox={`0 0 ${W} 190`} role="img" aria-label="値の表と期待値の重心" data-testid="tw-chart">
        <line x1={L} x2={R} y1={BASE} y2={BASE} className={s.axis} />
        {plotted.map(({ x, i, p, w }) => <g key={i}>
          <rect x={xpos(x) - 10} y={BASE - w / yMax * (BASE - TOP)} width="20" height={w / yMax * (BASE - TOP)} className={s.bar} />
          {a !== 0 && <rect x={xpos(x) - 14} y={TOP} width="28" height={BASE - TOP} className={s.hit} data-testid={`tw-bar-${i}`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e, i); }}
            onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e, i); }}
            onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} />}
          {a !== 0 && <text x={xpos(x)} y={BASE + 14} textAnchor="middle" className={s.tick}>{num(x)}</text>}
          <title>{table.labels?.[i] ?? num(x)}：重み{weights[i]}・確率{pct(p)}</title>
        </g>)}
        {a === 0 && <text x={xpos(b)} y={BASE + 14} textAnchor="middle" className={s.tick}>{num(b)}</text>}
        <path d={`M${xpos(moment.mean)},${BASE + 19}l-5,9h10Z`} className={s.mean} data-testid="tw-mean-marker" data-value={moment.mean} data-x={xpos(moment.mean)} />
        <text x={W / 2} y={185} textAnchor="middle" className={s.tick}>▲ {num(moment.mean)}{table.unit}</text>
      </svg>
    </figure>
    <div className={s.weights} role="group" aria-label="値ごとの重み">
      {table.values.map((x, i) => <label key={i} className={s.weight}>
        <span>{table.labels?.[i] ?? `${num(x)}${table.unit ?? ""}`}</span><b data-testid={`tw-weight-${i}`}>{weights[i]}</b>
        <input type="range" min="0" max={maxWeight} step="1" value={weights[i]} aria-label={`${table.labels?.[i] ?? num(x)}の重み`} data-testid={`tw-slider-${i}`} onChange={(e) => change(i, Number(e.target.value))} />
      </label>)}
    </div>
    <p role="status" className={s.hint}>{notice || `重みの合計 ${num(total)}・確率の合計 1`}</p>
    {linear && <fieldset className={s.linear}><legend>全部の値を a 倍して b 足す</legend>
      <label>a <output>{a}</output><input type="range" min="-3" max="3" step="0.5" value={a} aria-label="掛ける定数 a" data-testid="tw-a" onChange={(e) => { setA(Number(e.target.value)); setStep(0); }} /></label>
      <label>b <output>{b}</output><input type="range" min="-10" max="10" step="1" value={b} aria-label="足す定数 b" data-testid="tw-b" onChange={(e) => { setB(Number(e.target.value)); setStep(0); }} /></label>
      <Formula formula={linear} {...links} />
      <p className={s.hint}>変換前 E(X)＝{num(original.mean)} → a×E(X)＋b＝<b data-testid="tw-linear-result">{num(a * original.mean + b)}</b></p>
      {a === 0 && <p className={s.hint}>すべての値が {b} になり、確率は1つの値にまとまる。</p>}
    </fieldset>}
    <table className={s.table} aria-label="値と確率と期待値への寄与"><thead><tr><th>{linear && (a !== 1 || b !== 0) ? "変換後の値" : "値 x"}</th><th>確率 p(x)</th><th>値×確率</th></tr></thead>
      <tbody>{rows.map(({ x, i, p }) => <tr key={i}><td>{num(x)}{table.unit}</td><td data-testid={`tw-prob-${i}`}>{num(p)}</td><td data-testid={`tw-contribution-${i}`}>{num(x * p)}</td></tr>)}</tbody>
    </table>
    <p className={s.result}>期待値 <output data-testid="tw-mean">{num(moment.mean)}</output>{table.unit}<small>分散 <output data-testid="tw-variance">{num(moment.variance)}</output></small></p>
    <Formula formula={formula} {...links} />
    {steps.length > 0 && <div className={s.expansion}>
      <div className={s.controls}><b>Σを1項ずつ開く</b><button type="button" onClick={() => setStep(Math.max(0, shown - 1))} disabled={shown === 0} aria-label="Σの前の段">‹</button><span>{shown + 1}／{steps.length}</span><button type="button" onClick={() => setStep(Math.min(steps.length - 1, shown + 1))} disabled={shown === steps.length - 1} aria-label="Σの次の段">›</button></div>
      <div data-testid="tw-expansion" dangerouslySetInnerHTML={{ __html: tex(toTex(steps[shown]!, { symbols: formula.symbols })) }} />
    </div>}
  </>;
}
