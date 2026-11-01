// 問いの形の部品（stats2-course issue 161。試作「二項分布の問いの試作」版2 の形）。どの問いも同じ部品で組む：
// - 分布の行（数と割合つきの横棒）・理論の行・前と後を並べる行・実験と理論を比べる行
// - 数の比べ表（実験・理論・差と揺れの目安。「中／外」で言い、一致したとは言わない）
// - 移り変わりの図（倍々の時点・再生・理論の破線と値・線の名前・揺れの目安は初めは隠す。縦の範囲は線と理論から決め、再生の間は動かさない）
// - 下の操作の帯（札を押すと、その操作だけが出る）・桁の目盛りの予想・3つから選ぶ
import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic, reduced } from "./motion";
import s from "./QuestionParts.module.css";

export const pShort = (v: number) => (!Number.isFinite(v) ? "—" : v === 0 ? "0%" : v < 0.001 ? "<0.1%" : `${Number((v * 100).toFixed(1))}%`);
/** 有効数字3桁の％（丸めて 0 に見せない） */
export const pctSig = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0%"; if (v === 1) return "100%";
  const x = v * 100;
  if (x >= 0.1) return `${Number(x.toPrecision(3))}%`;
  return `${Number(x.toPrecision(3)).toFixed(Math.min(12, 2 - Math.floor(Math.log10(x))))}%`;
};
/** 約 N セットに1回 */
export const oneIn = (v: number) => {
  if (!(v > 0)) return "起きない"; if (v >= 0.5) return v >= 1 ? "毎セット" : "2セットに1回より多い";
  const n = 1 / v, r = n >= 1e4 ? Number(n.toPrecision(2)) : Math.round(n);
  const t = r >= 1e8 ? `${Number((r / 1e8).toPrecision(2))}億` : r >= 1e4 ? `${Number((r / 1e4).toPrecision(2))}万` : String(r);
  return `約 ${t} セットに1回`;
};
export const r2 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(2))));
export const fmtN = (x: number) => (x >= 10 ? String(Math.round(x)) : x >= 0.1 ? String(Number(x.toPrecision(2))) : String(Number(x.toPrecision(1))));
export const pc = (p: number) => `${Math.round(p * 100)}%`;

/** 成功の回数ごとのセット数と割合（数つきの横棒）。inEvent の行は色を変える */
export function DistRows({ counts, sets, inEvent, label = "成功の回数ごとのセット数と割合" }: { counts: number[]; sets: number; inEvent?: (k: number) => boolean; label?: string }) {
  const max = Math.max(1, ...counts);
  return <>
    <div className={s.rowsHead} aria-hidden="true"><span>成功</span><span /><span>セット</span><span>割合</span></div>
    <div className={s.rows} role="list" aria-label={label} data-testid="q-dist">
      {counts.map((c, k) => (
        <div key={k} role="listitem" className={inEvent?.(k) ? s.in : undefined} data-k={k} data-count={c}>
          <span>{k} 回</span><span className={s.bar}><i style={{ width: `${(c / max) * 100}%` }} /></span><span>{c.toLocaleString()}</span><span>{sets ? pShort(c / sets) : "—"}</span>
        </div>
      ))}
    </div>
  </>;
}

/** 理論の確率の行 */
export function TheoryRows({ pmf, inEvent }: { pmf: number[]; inEvent?: (k: number) => boolean }) {
  const max = Math.max(1e-12, ...pmf);
  return <>
    <div className={s.rowsHead} aria-hidden="true"><span>成功</span><span /><span /><span>確率</span></div>
    <div className={s.rows} role="list" aria-label="成功の回数ごとの理論の確率" data-testid="q-theory">
      {pmf.map((v, k) => (
        <div key={k} role="listitem" className={inEvent?.(k) ? s.in : undefined}><span>{k} 回</span><span className={s.bar}><i style={{ width: `${(v / max) * 100}%` }} /></span><span /><span>{pShort(v)}</span></div>
      ))}
    </div>
  </>;
}

/** 前と後（2つ）を1行に並べる。a・b は割合か確率。pk の行は色を変える */
export function PairRows({ labels, a, b, names, pk }: { labels: string[]; a: number[]; b: number[]; names: [string, string]; pk?: number }) {
  const max = Math.max(1e-12, ...a, ...b);
  return <>
    <div className={s.legend}><span><i className={s.kB} />{names[0]}</span><span><i />{names[1]}</span></div>
    <div className={s.rowsHead} aria-hidden="true"><span /><span /><span>{names[0]}</span><span>{names[1]}</span></div>
    <div className={s.rows} role="list" data-testid="q-pair">
      {labels.map((l, k) => (
        <div key={k} role="listitem" className={k === pk ? s.pk : undefined}>
          <span>{l}</span>
          <span className={s.pair}><span><i style={{ width: `${((a[k] ?? 0) / max) * 100}%` }} /></span><span><i style={{ width: `${((b[k] ?? 0) / max) * 100}%` }} /></span></span>
          <span>{a[k] === undefined ? "" : pShort(a[k]!)}</span><span>{b[k] === undefined ? "" : pShort(b[k]!)}</span>
        </div>
      ))}
    </div>
  </>;
}

/** 分布の比べ：k ごとに実験の割合（棒）と理論の確率（印）、ずれ（ポイント。2 以上を濃く） */
export function CompareRows({ counts, sets, pmf, inEvent, thName = "理論" }: { counts: number[]; sets: number; pmf: number[]; inEvent?: (k: number) => boolean; thName?: string }) {
  const fr = pmf.map((_, k) => (sets ? (counts[k] ?? 0) / sets : 0)), max = Math.max(1e-12, ...fr, ...pmf);
  return <>
    <div className={s.legend}><span><i />実験の割合</span><span><i className={s.kLine} />{thName}の確率</span></div>
    <div className={`${s.rowsHead} ${s.cmp}`} aria-hidden="true"><span>成功</span><span /><span>実験</span><span>{thName}</span><span>ずれ</span></div>
    <div className={`${s.rows} ${s.cmp}`} role="list" aria-label={`実験の割合と${thName}の確率`} data-testid="q-cmprows">
      {pmf.map((v, k) => {
        const e = fr[k]!, d = e - v;
        return (
          <div key={k} role="listitem" className={inEvent?.(k) ? s.in : undefined}>
            <span>{k} 回</span><span className={s.bar}><i style={{ width: `${(e / max) * 100}%` }} /><u style={{ left: `calc(${Math.min(99.5, (v / max) * 100)}% - 1px)` }} /></span>
            <span>{pShort(e)}</span><span>{pShort(v)}</span><span className={Math.abs(d) >= 0.02 ? s.bigD : undefined}>{d >= 0 ? "＋" : "−"}{Number((Math.abs(d) * 100).toFixed(1))}</span>
          </div>
        );
      })}
    </div>
    <p className={s.muted}>ずれは実験−{thName}（ポイント）。2 ポイント以上を濃く出す。</p>
  </>;
}

export type CmpRow = { label: string; exp: number | undefined; th: number; se?: number; fmt?: (v: number) => string };
/** 数の比べ表：実験・理論・差（揺れの目安 ±2×標準誤差）と「中／外」。一致したとは言わない */
export function CompareTable({ rows }: { rows: CmpRow[] }) {
  return <>
    <table className={s.table} data-testid="q-cmp">
      <thead><tr><th scope="col" /><th scope="col">実験</th><th scope="col">理論</th><th scope="col">差（目安）</th></tr></thead>
      <tbody>{rows.map((r) => {
        const f = r.fmt ?? r2, d = r.exp === undefined ? undefined : r.exp - r.th, inside = r.se === undefined || d === undefined ? undefined : Math.abs(d) <= r.se;
        return (
          <tr key={r.label} data-inside={inside === undefined ? undefined : String(inside)}>
            <td>{r.label}</td><td>{r.exp === undefined ? "—" : f(r.exp)}</td><td>{f(r.th)}</td>
            <td>{d === undefined ? "—" : `${d >= 0 ? "＋" : "−"}${f(Math.abs(d))}`}{r.se !== undefined && <small>±{f(r.se)} <b className={inside ? s.inside : s.outside}>{inside ? "中" : "外"}</b></small>}</td>
          </tr>
        );
      })}</tbody>
    </table>
    <p className={s.muted}>「中」：差が揺れの目安（±2×標準誤差）の中。理論どおりと言える範囲。「外」：たまたま大きくずれたか、理論の前提が合っていない。</p>
  </>;
}

const CHECKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
export type RunSeries = { name: string; path: number[]; th: number; se?: (i: number) => number };
/** 移り変わりの図。series は 1〜2 本（2本なら1本目が前・灰、2本目が後・青） */
export function RunChart({ title, ylab, fmt = r2, series, note }: { title: string; ylab: string; fmt?: (v: number) => string; series: RunSeries[]; note: string }) {
  const N = Math.max(0, ...series.map((x) => x.path.length));
  const [upto, setUpto] = useState<number | null>(null);
  const [band, setBand] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => { if (timer.current) clearInterval(timer.current); setUpto(null); }, [N]);
  if (!N) return null;
  const u = Math.min(upto ?? N, N);
  const W = 340, H = 190, L = 40, RR = 50, T = 14, B = 34;
  const xs = (i: number) => L + (N > 1 ? Math.log(i) / Math.log(N) : 0) * (W - L - RR);
  // 縦の範囲：線の実際の動きと理論（揺れの目安は入れない。再生の間も動かさない）
  const vals = series.flatMap((x) => [x.th, ...x.path]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad;
  const ys = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticksY = (() => { const span = hi - lo, st0 = 10 ** Math.floor(Math.log10(span / 4)); const st = [1, 2, 2.5, 5, 10].map((m) => m * st0).find((x) => span / x <= 5) ?? st0 * 10; const out: number[] = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(Number(v.toPrecision(6))); return out; })();
  const one = series.length === 1, cls = (j: number) => (one || j === 1 ? [s.lineA, s.fillA, s.textA] : [s.lineB, s.fillB, s.textB]);
  const step = Math.max(1, Math.floor(u / 400));
  const pts = (x: RunSeries) => { const p: string[] = []; for (let i = 1; i <= u; i += i < 50 ? 1 : step) p.push(`${xs(i).toFixed(1)},${ys(x.path[i - 1]!).toFixed(1)}`); p.push(`${xs(u).toFixed(1)},${ys(x.path[u - 1]!).toFixed(1)}`); return p.join(" "); };
  const bandOf = (x: RunSeries) => { if (!x.se) return ""; const up: string[] = [], dn: string[] = []; for (let i = 1; i <= N; i = Math.max(i + 1, Math.ceil(i * 1.15))) { up.push(`${xs(i).toFixed(1)},${ys(Math.min(hi, x.th + x.se(i))).toFixed(1)}`); dn.unshift(`${xs(i).toFixed(1)},${ys(Math.max(lo, x.th - x.se(i))).toFixed(1)}`); } return `${up.join(" ")} ${dn.join(" ")}`; };
  const ticks = CHECKS.filter((t) => t <= N);
  const under = ticks.filter((t) => t < N), chips = [...(under.length > 4 ? under.filter((t) => [1, 10, 100, 1000, 10000].includes(t)) : under), N];
  const thY = series.map((x) => ys(x.th));
  if (thY.length === 2 && Math.abs(thY[0]! - thY[1]!) < 12) { const m = (thY[0]! + thY[1]!) / 2, d = thY[0]! <= thY[1]! ? -6 : 6; thY[0] = m + d; thY[1] = m - d; }
  const top = Math.max(...series.map((x) => x.path[u - 1]!));
  const replay = () => {
    haptic(); if (timer.current) clearInterval(timer.current);
    // 動きを減らす設定でも、1セット目から順に進む（線を伸ばす動きでなく、時点の切り替えで見せる。#142 の再生と同じ）
    let i = 1; setUpto(1);
    timer.current = setInterval(() => { i = Math.min(N, Math.max(i + 1, Math.ceil(i * 1.18))); setUpto(i); if (i >= N && timer.current) { clearInterval(timer.current); setUpto(null); } }, reduced() ? 120 : 70);
  };
  return (
    <div data-testid="q-run" data-upto={u}>
      <div className={s.chips} style={{ gridTemplateColumns: `repeat(${chips.length + 1}, 1fr)` }} role="radiogroup" aria-label="何セット目まで">
        {chips.map((t) => <button key={t} type="button" role="radio" aria-checked={u === t} onClick={() => { if (timer.current) clearInterval(timer.current); setUpto(t === N ? null : t); }}>{t === N ? `全 ${N.toLocaleString()}` : t.toLocaleString()}</button>)}
        <button type="button" onClick={replay}>▶ 再生</button>
      </div>
      <p className={s.muted} data-testid="q-run-stat"><b>{u.toLocaleString()} セットまで</b>：実験 {series.map((x) => `${x.name} ${fmt(x.path[u - 1]!)}`).join("・")}／理論 {series.map((x) => `${x.name} ${fmt(x.th)}`).join("・")}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label={title} data-testid="q-run-chart" data-lo={lo} data-hi={hi}>
        <text x={L} y={9}>{ylab}</text><text x={W - 2} y={9} textAnchor="end">理論（破線・右の値）</text>
        {ticksY.map((v) => <g key={v}><line className={s.grid} x1={L} x2={W - RR} y1={ys(v)} y2={ys(v)} /><text x={L - 4} y={ys(v) + 3} textAnchor="end">{fmt(v)}</text></g>)}
        {band && series.map((x, j) => x.se && <polygon key={`b${j}`} className={cls(j)[1]} opacity={0.14} points={bandOf(x)} data-testid="q-run-band" />)}
        {series.map((x, j) => <g key={`t${j}`}><line className={cls(j)[0]} x1={L} x2={W - RR} y1={ys(x.th)} y2={ys(x.th)} strokeDasharray="4 3" /><circle className={cls(j)[1]} cx={W - RR} cy={ys(x.th)} r={3} /><text className={cls(j)[2]} x={W - RR + 6} y={thY[j]! + 3}>{fmt(x.th)}</text></g>)}
        {series.map((x, j) => <polyline key={`l${j}`} className={cls(j)[0]} fill="none" strokeWidth={2} points={pts(x)} data-testid={`q-run-line-${j}`} />)}
        {series.map((x, j) => { const up = one || x.path[u - 1]! >= top; return <text key={`n${j}`} className={cls(j)[2]} x={Math.min(W - RR - 4, xs(u))} y={ys(x.path[u - 1]!) + (up ? -7 : 14)} textAnchor="end" fontWeight={700}>{x.name}</text>; })}
        {ticks.map((t) => <text key={t} x={xs(t)} y={H - 18} textAnchor="middle">{t.toLocaleString()}</text>)}
        <text x={(L + W - RR) / 2} y={H - 3} textAnchor="middle">セット数（対数目盛：1・3・10・30…と倍々に進む）</text>
      </svg>
      {series.some((x) => x.se) && <>
        <button type="button" className={s.toggle} onClick={() => setBand(!band)} data-testid="q-run-band-toggle">{band ? "揺れの目安を隠す" : "揺れの目安を見る"}</button>
        {band && <p className={s.muted}>色の帯は揺れの目安（理論 ±2×標準誤差）。多くはこの中に入るが、いつも必ずこの中に入る範囲ではない。</p>}
      </>}
      <p className={s.note} data-testid="q-run-note">{note}</p>
    </div>
  );
}

/** 下の操作の帯：札を押すと、その1つの操作だけが出る */
export function Dock({ chips, sel, onSel, children, action }: { chips: [string, string][]; sel: string; onSel: (k: string) => void; children: ReactNode; action: ReactNode }) {
  return <div style={{ display: "grid", gap: 8 }}>
    <div className={s.chips} style={{ gridTemplateColumns: `repeat(${chips.length}, 1fr)` }} role="tablist" aria-label="変える条件">
      {chips.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={sel === k} onClick={() => { haptic(); onSel(k); }} data-testid={`q-chip-${k}`}>{t}</button>)}
    </div>
    <div className={s.dockCtl}>{children}</div>
    {action}
  </div>;
}

/** つまみ（名前と値の行の下）。動かしている間も onChange する */
export function Field({ label, value, min, max, step, show, onChange, id }: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void; id: string }) {
  return <div className={s.field}>
    <label htmlFor={id}><span>{label}</span><b>{show(value)}</b></label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={id} />
  </div>;
}

/** 切り替え（ちょうど／以上／以下 など） */
export function Seg<T extends string>({ name, items, value, onChange }: { name: string; items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return <div className={s.seg} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} role="radiogroup" aria-label={name}>
    {items.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => { haptic(); onChange(v); }}>{t}</button>)}
  </div>;
}

/** 桁の目盛りの予想（大きい順の境目から選び肢を作る。何セットに1回の言い換えつき） */
export function scaleChoices(scale: number[]) {
  const labels = [...scale.map((b, i) => (i === 0 ? `${pc(b)}以上` : `${pShort(b)}〜${pShort(scale[i - 1]!)}`)), `${pShort(scale[scale.length - 1]!)}未満`];
  const hints = [...scale.map((b, i) => (i === 0 ? `${Math.round(1 / b)}セットに1回以上` : `${Math.round(1 / scale[i - 1]!)}〜${Math.round(1 / b)}セットに1回`)), `${Math.round(1 / scale[scale.length - 1]!)}セットに1回より少ない`];
  const of = (v: number) => { const i = scale.findIndex((b) => v >= b); return i < 0 ? scale.length : i; };
  const nearEdge = (v: number) => scale.some((b) => Math.abs(v - b) < b * 0.1);
  return { labels, hints, of, nearEdge };
}
export function ScaleChoice({ name, scale, value, onChange }: { name: string; scale: number[]; value: number | undefined; onChange: (i: number) => void }) {
  const c = scaleChoices(scale);
  return <div className={s.scale} role="radiogroup" aria-label={name}>
    {c.labels.map((t, i) => <button key={t} type="button" role="radio" aria-checked={value === i} onClick={() => { haptic(); onChange(i); }}><span>{t}</span><small>{c.hints[i]}</small></button>)}
  </div>;
}

export const qs = s;
