// 実験室の共通の部品（#102・#119）：枠（段の列・問い・下の押す所）、分布の図、積み上がりの再生。
// どのモデル（二項・値の表）の実験室も、これを組み合わせて作る。
import katex from "katex";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SetRecord } from "@math-lab/engine";
import { haptic, reduced, tokenMs, useTween } from "./motion";
import s from "./Experiment.module.css";

export const STAGES = ["予測", "実験", "観察", "理由", "応用"] as const;
export const tex = (t: string) => { try { return katex.renderToString(t, { throwOnError: false, output: "html" }); } catch { return t; } };
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const r2 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(2))));
export const peak = (f: number[]) => f.reduce((b, v, i) => (v > f[b]! ? i : b), 0);
/** 分布の平均と分散（support の値と確率） */
export const momentsOf = (f: number[], support: number[]) => {
  const m = f.reduce((a, v, i) => a + support[i]! * v, 0);
  return { mean: m, variance: f.reduce((a, v, i) => a + (support[i]! - m) ** 2 * v, 0) };
};

/** 棒（実験の割合）・点（理論）・点線（前の条件）・線（あなたの予想）を重ねる図。横軸の文字は labels（なければ番号）。高さは前の値から動く */
export function Bars({ freq, theory, ghost, guess, hi, mark, markLabel = "予想", marker, labels, height = 150, label }: {
  freq?: number[]; theory?: number[]; ghost?: number[]; guess?: number[]; hi?: number;
  /** 縦の点線（位置は棒の番号。小数なら間に置く） */ mark?: number; markLabel?: string;
  /** 下の ▲（期待値など。位置は棒の番号。小数なら間に置く） */ marker?: number;
  labels?: (string | number)[]; height?: number; label: string;
}) {
  const base = freq ?? theory ?? [];
  const n = base.length - 1, W = 340, B = height - (marker !== undefined ? 30 : 20), R = 30;
  const raw = Math.max(1e-9, ...(freq ?? []), ...(theory ?? []), ...(ghost ?? []), ...(guess ?? []));
  const tick = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => raw / t <= 4) ?? 1;
  const top = Math.ceil(raw / tick - 1e-9) * tick;
  const [topT] = useTween([top]);
  const bars = useTween(base);
  const [mk] = useTween([marker ?? 0]);
  const y = (v: number) => B - (v / topT!) * (B - 12);
  const bw = (W - R) / (n + 1), x = (k: number) => k * bw + bw / 2;
  const every = n <= 12 ? 1 : n <= 30 ? 5 : 10;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={s.svg} role="img" aria-label={label}>
      {Array.from({ length: Math.round(top / tick) }, (_, i) => (i + 1) * tick).map((t) => (
        <g key={t}><line x1={0} x2={W - R + 4} y1={y(t)} y2={y(t)} className={s.grid} /><text x={W} y={y(t) + 3.5} textAnchor="end" className={s.tick}>{pct(t)}</text></g>
      ))}
      {ghost && <path d={ghost.map((v, k) => `${k ? "L" : "M"}${x(k)},${y(v)}`).join("")} className={s.ghost} />}
      {guess && <path d={guess.slice(0, n + 1).map((v, k) => `${k ? "L" : "M"}${x(k)},${y(v)}`).join("")} className={s.guess} data-testid="exp-guess" />}
      {bars.map((v, k) => (v > 0 && B - y(v) > 0.3) && (
        <rect key={k} x={x(k) - bw * 0.32} y={y(v)} width={bw * 0.64} height={B - y(v)} rx={Math.min(3, bw * 0.15)} className={k === hi ? s.barHi : freq ? s.bar : s.barTheory} />
      ))}
      {freq && theory?.map((v, k) => <circle key={k} cx={x(k)} cy={y(v)} r={3} className={s.dot} />)}
      <line x1={0} x2={W - R + 4} y1={B} y2={B} className={s.base} />
      {mark !== undefined && mark >= 0 && mark <= n && (
        <g className={s.mark} key={`m${mark}`}>
          <line x1={x(mark)} x2={x(mark)} y1={12} y2={B} />
          <text x={Math.min(W - R - 14, Math.max(14, x(mark)))} y={9} textAnchor="middle">{markLabel}</text>
        </g>
      )}
      {base.map((_, k) => (k % every === 0 || k === hi) && <text key={k} x={x(k)} y={B + 14} textAnchor="middle" className={k === hi ? s.tickOn : s.tick}>{labels?.[k] ?? k}</text>)}
      {marker !== undefined && <path d={`M${x(mk!)},${B + 18} l -6 9 h 12 z`} className={s.marker} data-testid="exp-marker" />}
    </svg>
  );
}

/** 実験室の枠：上（戻る・題・ⓘ・段の列・今回の問い）、中（1つの段の中身）、下（押す所） */
export function LabShell({ title, question, stage, reached, go, onBack, onInfo, body, cta, children }: {
  title: string; question: string; stage: number; reached: number; go: (i: number) => void;
  onBack?: () => void; onInfo?: () => void; body: ReactNode; cta: ReactNode; children?: ReactNode;
}) {
  return (
    <div className={s.root} data-testid="experiment">
      <div className={s.top} id="exp-top">
        <div className={s.titleRow}>{onBack && <button type="button" className={s.info} onClick={onBack} aria-label="戻る">←</button>}<b>{title}</b>{onInfo && <button type="button" className={s.info} onClick={onInfo} aria-label="基本と用語">ⓘ</button>}</div>
        <ol className={s.stepper} aria-label="段">
          {STAGES.map((t, i) => (
            <li key={t}><button type="button" disabled={i > reached} aria-current={i === stage ? "step" : undefined} className={i < stage || (i <= reached && i !== stage) ? s.done : undefined} onClick={() => go(i)}>
              <i>{i < stage ? "✓" : i + 1}</i>{t}</button></li>
          ))}
        </ol>
        <p className={s.q} data-testid="exp-question"><span>今回の問い</span>{question}</p>
      </div>
      <div className={s.body} key={stage}>{body}</div>
      <div className={s.bar}>{cta}</div>
      {children}
    </div>
  );
}

/** 段の移り方（行ったことのある段へは戻れる・上へ戻す） */
export function useStages() {
  const [stage, setStage] = useState(0);
  const [reached, setReached] = useState(0);
  const go = (i: number) => {
    haptic(); setStage(i); setReached((r) => Math.max(r, i));
    document.getElementById("exp-top")?.scrollIntoView?.({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  };
  return { stage, reached, go };
}

const MARKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];

/**
 * 積み上がりの再生（issue 119）：何セット目までの結果かを、倍々の目盛り（1・3・10・30・100…）で選ぶと、その時点の割合と平均に戻る。
 * 下の図は平均の移り変わり（横は対数の目盛り）。理論の平均の線と、ずれの目安（±2×標準偏差÷√セット数。4倍集めると半分）を重ねる。
 * 記録にはセットごとの値（ks）が残っているので、実験をやり直さずに戻せる。
 */
export function Replay({ rec, theory, labels, unit = "" }: { rec: SetRecord; theory: number[]; labels?: (string | number)[]; unit?: string }) {
  const N = rec.sets;
  const marks = useMemo(() => [...MARKS.filter((m) => m < N), N], [N]);
  const [t, setT] = useState(marks.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setT(marks.length - 1); }, [marks.length]);
  const play = () => {
    haptic(); setPlaying(true); setT(0);
    const step = (i: number) => { timer.current = setTimeout(() => { setT(i); if (i < marks.length - 1) step(i + 1); else setPlaying(false); }, reduced() ? 0 : tokenMs("--dur-flash", 700)); };
    step(1);
  };
  const upto = marks[Math.min(t, marks.length - 1)] ?? N;
  const at = useMemo(() => new Map(rec.support.map((v, i) => [v, i])), [rec.support]);
  const freq = useMemo(() => { const c = rec.support.map(() => 0); for (let i = 0; i < upto; i++) c[at.get(rec.ks[i]!)!]! += 1; return c.map((v) => v / Math.max(1, upto)); }, [rec, upto, at]);
  const th = momentsOf(theory, rec.support), sd = Math.sqrt(th.variance);
  // 平均の移り変わり（対数の目盛りで ~120 点）
  const W = 340, H = 120, L = 4, Rm = 34, T = 8, B = H - 18;
  const pts = useMemo(() => {
    const out: { i: number; m: number }[] = []; let sum = 0, next = 1;
    for (let i = 1; i <= N; i++) { sum += rec.ks[i - 1]!; if (i >= next || i === N) { out.push({ i, m: sum / i }); next = Math.max(i + 1, Math.ceil(i * 1.06)); } }
    return out;
  }, [rec, N]);
  const lx = (i: number) => L + (Math.log10(i) / Math.max(1e-9, Math.log10(Math.max(10, N)))) * (W - L - Rm);
  const lo = Math.min(th.mean - 2.2 * sd, ...pts.map((p) => p.m)), hi = Math.max(th.mean + 2.2 * sd, ...pts.map((p) => p.m));
  const ly = (v: number) => B - ((v - lo) / Math.max(1e-9, hi - lo)) * (B - T);
  const cur = pts.filter((p) => p.i <= upto).at(-1);
  const band = pts.map((p) => [lx(p.i), ly(th.mean + (2 * sd) / Math.sqrt(p.i)), ly(th.mean - (2 * sd) / Math.sqrt(p.i))] as const);
  if (N < 2) return null;
  return (
    <section className={s.card} data-testid="exp-replay">
      <p className={s.h}>積み上がりを見直す<span>倍々の目盛りで</span></p>
      <div className={s.marks} role="radiogroup" aria-label="何セット目まで">
        {marks.map((m, i) => <button key={m} type="button" role="radio" aria-checked={i === t} onClick={() => { haptic(); setT(i); }}>{i === marks.length - 1 ? `${m}（全部）` : m}</button>)}
        <button type="button" className={s.play} onClick={play} disabled={playing} aria-label="1セット目から再生">{playing ? "再生中" : "▶ 再生"}</button>
      </div>
      <p className={s.replayStat} data-testid="exp-replay-stat"><b>{upto}</b> セットまで：平均 <b>{r2(cur?.m)}{unit}</b>（理論 {r2(th.mean)}{unit}・ずれ {r2(cur ? Math.abs(cur.m - th.mean) : undefined)}）</p>
      <Bars freq={freq} theory={theory} labels={labels} height={120} label={`${upto} セットまでの割合と理論`} />
      <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label="平均の移り変わり">
        <path d={`M${band.map(([x, a]) => `${x},${a}`).join("L")}L${[...band].reverse().map(([x, , b]) => `${x},${b}`).join("L")}Z`} className={s.band} />
        <line x1={L} x2={W - Rm + 4} y1={ly(th.mean)} y2={ly(th.mean)} className={s.meanLine} />
        <text x={W} y={ly(th.mean) + 3.5} textAnchor="end" className={s.tick}>{r2(th.mean)}</text>
        <path d={pts.map((p, i) => `${i ? "L" : "M"}${lx(p.i)},${ly(p.m)}`).join("")} className={s.runLine} />
        {cur && <circle cx={lx(cur.i)} cy={ly(cur.m)} r={4} className={s.runDot} />}
        <line x1={L} x2={W - Rm + 4} y1={B} y2={B} className={s.base} />
        {MARKS.filter((m) => m <= Math.max(10, N)).map((m) => <text key={m} x={lx(m)} y={H - 4} textAnchor="middle" className={s.tick}>{m}</text>)}
      </svg>
      <p className={s.note}>線＝平均の移り変わり。帯＝理論の平均 ±2×標準偏差÷√セット数（4倍集めると幅は半分）。少ないうちは大きく揺れ、増えるほど理論の平均に吸い寄せられる。</p>
    </section>
  );
}
