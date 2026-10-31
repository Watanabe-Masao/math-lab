// 実験室の共通の部品（#102・#119）：枠（段の列・問い・下の押す所）、分布の図、積み上がりの再生。
// どのモデル（二項・値の表）の実験室も、これを組み合わせて作る。
import katex from "katex";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRandom, emptySetRecord, runSets, type Mechanism, type SetRecord } from "@math-lab/engine";
import { haptic, reduced, useTween } from "./motion";
import s from "./Experiment.module.css";

export const STAGES = ["予測", "実験", "観察", "理由", "応用", "比べる"] as const;
export const tex = (t: string) => { try { return katex.renderToString(t, { throwOnError: false, output: "html" }); } catch { return t; } };
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const r2 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(2))));
/** 図の目盛りの数：大きい数は有効数字3桁で区切る（3515.5 → 3,520） */
export const num3 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1000 ? Number(v.toPrecision(3)).toLocaleString("ja-JP") : r2(v));
export const peak = (f: number[]) => f.reduce((b, v, i) => (v > f[b]! ? i : b), 0);
/** 分布の平均と分散（support の値と確率） */
export const momentsOf = (f: number[], support: number[]) => {
  const m = f.reduce((a, v, i) => a + support[i]! * v, 0);
  return { mean: m, variance: f.reduce((a, v, i) => a + (support[i]! - m) ** 2 * v, 0) };
};

/** 長さをそろえる（足りない所は0。前と後で n が違うときに横軸を合わせる） */
const padTo = (f: number[] | undefined, n: number) => (f ? [...f, ...Array(Math.max(0, n - f.length)).fill(0)] : undefined);

/** 棒（実験の割合）・点（理論）・点線（前の条件）・線（あなたの予想）を重ねる図。横軸の文字は labels（なければ番号）。高さは前の値から動く。
 *  pair（前の条件の実験の割合）があると、各値に「前」と「後」の棒を左右に並べる（issue 121）。点線（前の理論）は前の棒、点（後の理論）は後の棒に乗る */
export function Bars({ freq: freq0, pair: pair0, series, theory: theory0, ghost: ghost0, guess, hi, mark, markLabel = "予想", marker, labels, height = 150, label }: {
  freq?: number[]; pair?: number[]; theory?: number[]; ghost?: number[]; guess?: number[]; hi?: number;
  /** 比べる（issue 122）：いくつかの実験の割合を、値ごとに左から並べる（4つまで。色は SERIES の順） */
  series?: number[][];
  /** 縦の点線（位置は棒の番号。小数なら間に置く） */ mark?: number; markLabel?: string;
  /** 下の ▲（期待値など。位置は棒の番号。小数なら間に置く） */ marker?: number;
  labels?: (string | number)[]; height?: number; label: string;
}) {
  if (series) return <MultiBars series={series} labels={labels} height={height} label={label} />;
  const len = Math.max(freq0?.length ?? 0, pair0?.length ?? 0, theory0?.length ?? 0);
  const freq = padTo(freq0, len), pair = padTo(pair0, len), theory = padTo(theory0, len), ghost = padTo(ghost0, len);
  const base = freq ?? theory ?? [];
  const n = base.length - 1, W = 340, B = height - (marker !== undefined ? 30 : 20), R = 30;
  const raw = Math.max(1e-9, ...(freq ?? []), ...(pair ?? []), ...(theory ?? []), ...(ghost ?? []), ...(guess ?? []));
  const tick = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => raw / t <= 4) ?? 1;
  const top = Math.ceil(raw / tick - 1e-9) * tick;
  const [topT] = useTween([top]);
  const bars = useTween(base);
  const bars0 = useTween(pair ?? base.map(() => 0));
  const [mk] = useTween([marker ?? 0]);
  const y = (v: number) => B - (v / topT!) * (B - 12);
  const bw = (W - R) / (n + 1), x = (k: number) => k * bw + bw / 2;
  // 前と後を並べるときは、前を左・後を右に置く
  const off = pair ? bw * 0.18 : 0, xb = (k: number) => x(k) - off, xa = (k: number) => x(k) + off, wid = pair ? bw * 0.34 : bw * 0.64;
  const every = n <= 12 ? 1 : n <= 30 ? 5 : 10;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={s.svg} role="img" aria-label={label}>
      {Array.from({ length: Math.round(top / tick) }, (_, i) => (i + 1) * tick).map((t) => (
        <g key={t}><line x1={0} x2={W - R + 4} y1={y(t)} y2={y(t)} className={s.grid} /><text x={W} y={y(t) + 3.5} textAnchor="end" className={s.tick}>{pct(t)}</text></g>
      ))}
      {ghost && <path d={ghost.map((v, k) => `${k ? "L" : "M"}${xb(k)},${y(v)}`).join("")} className={s.ghost} />}
      {guess && <path d={guess.slice(0, n + 1).map((v, k) => `${k ? "L" : "M"}${x(k)},${y(v)}`).join("")} className={s.guess} data-testid="exp-guess" />}
      {pair && bars0.map((v, k) => (v > 0 && B - y(v) > 0.3) && (
        <rect key={`b${k}`} x={xb(k) - wid / 2} y={y(v)} width={wid} height={B - y(v)} rx={Math.min(3, wid * 0.2)} className={s.barBefore} data-testid="exp-bar-before" />
      ))}
      {bars.map((v, k) => (v > 0 && B - y(v) > 0.3) && (
        <rect key={k} x={xa(k) - wid / 2} y={y(v)} width={wid} height={B - y(v)} rx={Math.min(3, wid * 0.2)} className={k === hi ? s.barHi : freq ? s.bar : s.barTheory} />
      ))}
      {freq && theory?.map((v, k) => <circle key={k} cx={xa(k)} cy={y(v)} r={pair ? 2.5 : 3} className={s.dot} />)}
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

/** 比べるの系列の色（データの色の順。4つまで） */
export const SERIES = [s.ser1, s.ser2, s.ser3, s.ser4] as const;

function MultiBars({ series, labels, height, label }: { series: number[][]; labels?: (string | number)[]; height: number; label: string }) {
  const len = Math.max(1, ...series.map((f) => f.length));
  const W = 340, B = height - 20, R = 30, n = len - 1;
  const raw = Math.max(1e-9, ...series.flat());
  const tick = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => raw / t <= 4) ?? 1;
  const top = Math.ceil(raw / tick - 1e-9) * tick;
  const y = (v: number) => B - (v / top) * (B - 12);
  const bw = (W - R) / (n + 1), k = series.length, wid = (bw * 0.8) / Math.max(1, k);
  const x0 = (i: number, j: number) => i * bw + bw * 0.1 + j * wid;
  const every = n <= 12 ? 1 : n <= 30 ? 5 : 10;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={s.svg} role="img" aria-label={label} data-testid="exp-multibars">
      {Array.from({ length: Math.round(top / tick) }, (_, i) => (i + 1) * tick).map((t) => (
        <g key={t}><line x1={0} x2={W - R + 4} y1={y(t)} y2={y(t)} className={s.grid} /><text x={W} y={y(t) + 3.5} textAnchor="end" className={s.tick}>{pct(t)}</text></g>
      ))}
      {series.map((f, j) => f.map((v, i) => (v > 0 && B - y(v) > 0.3) && (
        <rect key={`${j}-${i}`} x={x0(i, j)} y={y(v)} width={Math.max(1, wid - 1)} height={B - y(v)} rx={Math.min(2, wid * 0.2)} className={SERIES[j % SERIES.length]} />
      )))}
      <line x1={0} x2={W - R + 4} y1={B} y2={B} className={s.base} />
      {Array.from({ length: len }, (_, i) => i % every === 0 && <text key={i} x={i * bw + bw / 2} y={B + 14} textAnchor="middle" className={s.tick}>{labels?.[i] ?? i}</text>)}
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
export function useStages(initial = 0) {
  const [stage, setStage] = useState(initial);
  const [reached, setReached] = useState(initial);
  const go = (i: number) => {
    haptic(); setStage(i); setReached((r) => Math.max(r, i));
    document.getElementById("exp-top")?.scrollIntoView?.({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  };
  return { stage, reached, go };
}

/**
 * 前の条件と変えた条件を、同じセット数ずつ起こす（issue 121）。押すたびに両方へ同じ数を足すので、回数は必ずそろう。
 * 種は1つ（画面に出す）。前は種、後は種＋1 の乱数で、同じ種なら同じ結果。起き方が変わったら両方の記録を新しく始める。
 */
export function usePairRuns(before: Mechanism, after: Mechanism, seed0?: number) {
  const [seed, setSeed] = useState(() => seed0 ?? Date.now() % 100000);
  const rngA = useRef(createRandom(seed)), rngB = useRef(createRandom(seed + 1));
  const [recs, setRecs] = useState(() => ({ before: emptySetRecord(seed, before), after: emptySetRecord(seed + 1, after) }));
  const [fresh, setFresh] = useState(0);
  const stream = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (stream.current) { clearInterval(stream.current); stream.current = null; } };
  useEffect(() => stop, []);
  const key = JSON.stringify([before, after]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    stop(); const sd = Date.now() % 100000; setSeed(sd);
    rngA.current = createRandom(sd); rngB.current = createRandom(sd + 1);
    setRecs({ before: emptySetRecord(sd, before), after: emptySetRecord(sd + 1, after) });
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const recsRef = useRef(recs); recsRef.current = recs;
  const step = (m: number) => {   // 更新の関数の中で乱数を進めない（二度呼ばれると種の結果がずれる）
    const cur = recsRef.current;
    const next = { before: runSets(rngA.current, cur.before, m), after: runSets(rngB.current, cur.after, m) };
    recsRef.current = next; setRecs(next); setFresh((f) => f + 1);
  };
  const run = (count: number, per = 10) => {
    haptic(); stop();
    if (count === 1 || reduced()) { step(count); return; }
    let done = 0;
    const tick = () => { const m = Math.min(per, count - done); step(m); done += m; if (done >= count) stop(); };
    tick(); stream.current = setInterval(tick, 60);
  };
  return { before: recs.before, after: recs.after, run, seed, fresh, sets: recs.after.sets };
}

/** 記録の割合（記録の support の並び） */
export const freqOf = (rec: SetRecord, upto = rec.sets) => {
  const at = new Map(rec.support.map((v, i) => [v, i])), c = rec.support.map(() => 0);
  for (let i = 0; i < upto; i++) c[at.get(rec.ks[i]!)!]! += 1;
  return c.map((v) => v / Math.max(1, upto));
};

const MARKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];

/**
 * 積み上がりの再生（issue 119）：何セット目までの結果かを、倍々の目盛り（1・3・10・30・100…）で選ぶと、その時点の割合と平均に戻る。
 * 下の図は平均の移り変わり（横は対数の目盛り）。理論の平均の線と、ずれの目安（±2×標準偏差÷√セット数。4倍集めると半分）を重ねる。
 * 記録にはセットごとの値（ks）が残っているので、実験をやり直さずに戻せる。
 */
/** 再生で1つの目盛りを見せる時間（ms） */
const REPLAY_MS = 900;

export function Replay({ rec, theory, before, labels, unit = "" }: {
  rec: SetRecord; theory: number[];
  /** 前の条件の記録と理論（#121）。あると、割合を前と後で並べ、平均の線を2本にする */
  before?: { rec: SetRecord; theory: number[] };
  labels?: (string | number)[]; unit?: string;
}) {
  const N = rec.sets;
  const marks = useMemo(() => [...MARKS.filter((m) => m < N), N], [N]);
  const [t, setT] = useState(marks.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setT(marks.length - 1); }, [marks.length]);
  const play = () => {
    haptic(); setPlaying(true); setT(0);
    // 再生の速さは中身（何セット目かを順に見せる）なので、動きを減らす設定でも飛ばさない（渡辺さん 2026-10-31：「再生を押すと一気に600まで飛ぶ」）。
    // 減らす設定で止めるのは、棒が伸びる・光るなどの飾りの動きだけ
    const step = (i: number) => { timer.current = setTimeout(() => { setT(i); if (i < marks.length - 1) step(i + 1); else setPlaying(false); }, REPLAY_MS); };
    step(1);
  };
  const upto = marks[Math.min(t, marks.length - 1)] ?? N;
  const freq = useMemo(() => freqOf(rec, upto), [rec, upto]);
  const freqB = useMemo(() => (before ? freqOf(before.rec, Math.min(upto, before.rec.sets)) : undefined), [before, upto]);
  // 平均の移り変わり（対数の目盛りで ~120 点）
  const W = 340, H = 120, L = 4, Rm = 34, T = 8, B = H - 18;
  const runOf = (r: SetRecord) => {
    const out: { i: number; m: number }[] = []; let sum = 0, next = 1;
    for (let i = 1; i <= r.sets; i++) { sum += r.ks[i - 1]!; if (i >= next || i === r.sets) { out.push({ i, m: sum / i }); next = Math.max(i + 1, Math.ceil(i * 1.06)); } }
    return out;
  };
  const series = useMemo(() => [
    ...(before ? [{ key: "b", th: momentsOf(before.theory, before.rec.support), pts: runOf(before.rec), line: s.runLineB, dot: s.runDotB, mean: s.meanLineB }] : []),
    { key: "a", th: momentsOf(theory, rec.support), pts: runOf(rec), line: s.runLine, dot: s.runDot, mean: s.meanLine },
  ], [rec, theory, before]);   // eslint-disable-line react-hooks/exhaustive-deps
  const lx = (i: number) => L + (Math.log10(i) / Math.max(1e-9, Math.log10(Math.max(10, N)))) * (W - L - Rm);
  // 縦の幅は、実際の平均の動きと、10セット目の帯（±2σ/√10）に合わせる。散らばりの大きい表（反例）でも平均の揺れが見えるように、帯ははみ出た分を切る
  const ends = series.flatMap((x) => { const w10 = (2 * Math.sqrt(x.th.variance)) / Math.sqrt(10); return [x.th.mean - w10, x.th.mean + w10, ...x.pts.map((p) => p.m)]; });
  const lo0 = Math.min(...ends), hi0 = Math.max(...ends), pad = (hi0 - lo0) * 0.06;
  const lo = lo0 - pad, hi = hi0 + pad;
  const ly = (v: number) => B - ((Math.min(hi, Math.max(lo, v)) - lo) / Math.max(1e-9, hi - lo)) * (B - T);
  const curOf = (pts: { i: number; m: number }[]) => pts.filter((p) => p.i <= upto).at(-1);
  const a = series.at(-1)!, b = before ? series[0] : undefined, ca = curOf(a.pts), cb = b ? curOf(b.pts) : undefined;
  if (N < 2) return null;
  return (
    <section className={s.card} data-testid="exp-replay">
      <p className={s.h}>積み上がりを見直す<span>倍々の目盛りで</span></p>
      <div className={s.marks} role="radiogroup" aria-label="何セット目まで">
        {marks.map((m, i) => <button key={m} type="button" role="radio" aria-checked={i === t} onClick={() => { haptic(); setT(i); }}>{i === marks.length - 1 ? `全 ${m}` : m}</button>)}
        <button type="button" className={s.play} onClick={play} disabled={playing} aria-label="1セット目から再生">{playing ? "再生中" : "▶ 再生"}</button>
      </div>
      {b ? (
        <p className={s.replayStat} data-testid="exp-replay-stat"><b>{upto}</b> セットまで：前 <b>{num3(cb?.m)}{unit}</b> → 後 <b>{num3(ca?.m)}{unit}</b>（差 {num3(ca && cb ? ca.m - cb.m : undefined)}。理論の差 {num3(a.th.mean - b.th.mean)}）</p>
      ) : (
        <p className={s.replayStat} data-testid="exp-replay-stat"><b>{upto}</b> セットまで：平均 <b>{num3(ca?.m)}{unit}</b>（理論 {num3(a.th.mean)}{unit}・ずれ {num3(ca ? Math.abs(ca.m - a.th.mean) : undefined)}）</p>
      )}
      <Bars freq={freq} pair={freqB} theory={theory} ghost={before?.theory} labels={labels} height={120} label={`${upto} セットまでの割合と理論`} />
      <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label="平均の移り変わり">
        {series.map((x) => {
          const sd = Math.sqrt(x.th.variance), band = x.pts.map((p) => [lx(p.i), ly(x.th.mean + (2 * sd) / Math.sqrt(p.i)), ly(x.th.mean - (2 * sd) / Math.sqrt(p.i))] as const);
          return <path key={`band${x.key}`} d={`M${band.map(([bx, ba]) => `${bx},${ba}`).join("L")}L${[...band].reverse().map(([bx, , bb]) => `${bx},${bb}`).join("L")}Z`} className={x.key === "b" ? s.bandB : s.band} />;
        })}
        {series.map((x) => (
          <g key={x.key}>
            <line x1={L} x2={W - Rm + 4} y1={ly(x.th.mean)} y2={ly(x.th.mean)} className={x.mean} />
            <text x={W} y={ly(x.th.mean) + 3.5} textAnchor="end" className={s.tick}>{num3(x.th.mean)}</text>
            <path d={x.pts.map((p, i) => `${i ? "L" : "M"}${lx(p.i)},${ly(p.m)}`).join("")} className={x.line} data-testid={`exp-run-line-${x.key}`} />
            {(() => { const c = curOf(x.pts); return c && <circle cx={lx(c.i)} cy={ly(c.m)} r={4} className={x.dot} />; })()}
          </g>
        ))}
        <line x1={L} x2={W - Rm + 4} y1={B} y2={B} className={s.base} />
        {MARKS.filter((m) => m <= Math.max(10, N)).map((m) => <text key={m} x={lx(m)} y={H - 4} textAnchor="middle" className={s.tick}>{m}</text>)}
      </svg>
      <p className={s.note}>{b ? "2本の線＝前と後の平均の移り変わり。帯＝それぞれの理論の平均 ±2×標準偏差÷√セット数。少ないうちは線どうしが近づいたり入れ替わったりもするが、増えるほど理論の差に開いていく。" : "線＝平均の移り変わり。帯＝理論の平均 ±2×標準偏差÷√セット数（4倍集めると幅は半分）。少ないうちは大きく揺れ、増えるほど理論の平均に吸い寄せられる。"}</p>
    </section>
  );
}
