// 実験室の共通の部品（#102・#119）：枠（段の列・問い・下の押す所）、分布の図、積み上がりの再生。
// どのモデル（二項・値の表）の実験室も、これを組み合わせて作る。
import katex from "katex";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRandom, emptySetRecord, runSets, type Mechanism, type SetRecord } from "@math-lab/engine";
import { haptic, reduced, useTween } from "./motion";
import { useRunner } from "./runner";
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
export function Bars({ freq: freq0, pair: pair0, series, theory: theory0, ghost: ghost0, guess, hi, hiIn, mark, markLabel = "予想", marker, at, labels, height = 150, label }: {
  freq?: number[]; pair?: number[]; theory?: number[]; ghost?: number[]; guess?: number[]; hi?: number;
  /** 事象に入る棒を強調する（k 回以上など。stats2-course issue 161 確率の値の問い） */ hiIn?: (k: number) => boolean;
  /** 比べる（issue 122）：いくつかの実験の割合を、値ごとに左から並べる（4つまで。色は SERIES の順） */
  series?: number[][];
  /** 縦の点線（位置は棒の番号。小数なら間に置く） */ mark?: number; markLabel?: string;
  /** 下の ▲（期待値など。位置は棒の番号。小数なら間に置く） */ marker?: number;
  /** 棒ごとの値（stats2-course issue 158 A1）。あれば横の位置を値に比例させ、mark・marker も値で受ける（作業台の図と同じ置き方。
   *  値の間が不ぞろいな表で、▲を番号の間に割って置くと重心からずれて見えるため）。棒が細くなりすぎる表では ▲・点線を出さない */
  at?: number[];
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
  // 横の位置：値があれば値に比例（左右に値の間の半分の余白）、なければ番号で等間隔
  const gap = at && at.length > 1 ? Math.min(...at.slice(1).map((v, i) => v - at[i]!)) : 1;
  const span = at && at.length > 1 ? at[at.length - 1]! - at[0]! + gap : 1;
  const prop = !!at && at.length === n + 1 && (gap / span) * (W - R) >= 8;
  const xv = (v: number) => ((v - (at![0]! - gap / 2)) / span) * (W - R);
  const bw = prop ? (gap / span) * (W - R) : (W - R) / (n + 1), x = (k: number) => (prop ? xv(at![k]!) : k * bw + bw / 2);
  // mark・marker：値で受けたら値の位置。比例にできない表では出さない（番号の間に割って置かない）
  const xm = (v: number) => (at ? (prop ? xv(v) : undefined) : x(v));
  const markX = mark === undefined || (!at && (mark < 0 || mark > n)) ? undefined : xm(mark);
  const markerX = marker === undefined ? undefined : at ? (prop ? xv(mk!) : undefined) : x(mk!);
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
        <rect key={k} x={xa(k) - wid / 2} y={y(v)} width={wid} height={B - y(v)} rx={Math.min(3, wid * 0.2)} className={k === hi || hiIn?.(k) ? s.barHi : freq ? s.bar : s.barTheory} data-x={xa(k)} data-hi={hiIn?.(k) || undefined} />
      ))}
      {freq && theory?.map((v, k) => <circle key={k} cx={xa(k)} cy={y(v)} r={pair ? 2.5 : 3} className={s.dot} />)}
      <line x1={0} x2={W - R + 4} y1={B} y2={B} className={s.base} />
      {markX !== undefined && (
        <g className={s.mark} key={`m${mark}`} data-testid="exp-mark" data-x={markX}>
          <line x1={markX} x2={markX} y1={12} y2={B} />
          <text x={Math.min(W - R - 14, Math.max(14, markX))} y={9} textAnchor="middle">{markLabel}</text>
        </g>
      )}
      {base.map((_, k) => (k % every === 0 || k === hi) && <text key={k} x={x(k)} y={B + 14} textAnchor="middle" className={k === hi ? s.tickOn : s.tick}>{labels?.[k] ?? k}</text>)}
      {markerX !== undefined && <path d={`M${markerX},${B + 18} l -6 9 h 12 z`} className={s.marker} data-testid="exp-marker" data-x={markerX} />}
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
export function LabShell({ title, question, stage, reached, go, onBack, onInfo, body, cta, children, stages = STAGES, stepper = true, qLabel = "今回の問い" }: {
  title: string; question: string; stage: number; reached: number; go: (i: number) => void;
  onBack?: () => void; onInfo?: () => void; body: ReactNode; cta: ReactNode; children?: ReactNode;
  /** 段の名前（問いの形で段の数が違う。stats2-course issue 161） */ stages?: readonly string[];
  /** 段の列を出すか（入口の「何を確かめたい？」では出さない） */ stepper?: boolean; qLabel?: string;
}) {
  return (
    <div className={s.root} data-testid="experiment">
      <div className={s.top} id="exp-top">
        <div className={s.titleRow}>{onBack && <button type="button" className={s.info} onClick={onBack} aria-label="戻る">←</button>}<b>{title}</b>{onInfo && <button type="button" className={s.info} onClick={onInfo} aria-label="基本と用語">ⓘ</button>}</div>
        {stepper && <ol className={s.stepper} aria-label="段" style={{ "--n": stages.length } as CSSProperties}>
          {stages.map((t, i) => (
            <li key={t}><button type="button" disabled={i > reached} aria-current={i === stage ? "step" : undefined} className={i < stage || (i <= reached && i !== stage) ? s.done : undefined} onClick={() => go(i)}>
              <i>{i < stage ? "✓" : i + 1}</i>{t}</button></li>
          ))}
        </ol>}
        <p className={s.q} data-testid="exp-question"><span>{qLabel}</span>{question}</p>
      </div>
      <div className={s.body} key={stage}>{body}</div>
      {cta ? <div className={s.bar}>{cta}</div> : null}   {/* 押す所のない画面（入口・比べる）は下の帯を出さない（空の帯が横にはみ出していた） */}
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

/** 1つの条件を起こし続ける（確率の値の問い。stats2-course issue 161）。種つき・分けても同じ。起き方が変わったら新しく始める */
export function useRuns(m: Mechanism, seed0?: number) {
  const [seed, setSeed] = useState(() => seed0 ?? Date.now() % 100000);
  const rng = useRef(createRandom(seed));
  const [rec, setRec] = useState(() => emptySetRecord(seed, m));
  const { start, stop } = useRunner();
  const key = JSON.stringify(m), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    stop(); const sd = Date.now() % 100000; setSeed(sd); rng.current = createRandom(sd); setRec(emptySetRecord(sd, m));
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef(rec); ref.current = rec;
  const step = (k: number) => { const next = runSets(rng.current, ref.current, k); ref.current = next; setRec(next); };
  const run = (count: number, per = 20) => {
    haptic(); stop();
    if (count === 1 || reduced()) { step(count); return; }
    let done = 0;
    start(() => { const k = Math.min(per, count - done); step(k); done += k; return done >= count; }, 60);
  };
  return { rec, run, seed };
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
  const { start, stop } = useRunner();   // 実行中の更新は1か所で止める（止めた後の更新は捨てる。#142）
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
    start(() => { const m = Math.min(per, count - done); step(m); done += m; return done >= count; }, 60);
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
 * 積み上がりの再生（issue 119）：何回目までの結果かを、倍々の目盛り（1・3・10・30・100…）で選ぶと、その時点の平均と割合に戻る。
 * 主役は「実験の平均が期待値の近くに落ち着いていく様子」（渡辺さん 2026-11-01）：上に平均の移り変わり（縦＝ここまでの平均、横＝回数の対数目盛）を大きく、
 * 下に「なぜ平均が変わったか」を調べる補助として値ごとの割合を置く。線には「変更前」「変更後」、期待値の線には「期待値」と数を直接書く（色を覚えなくても追える）。
 * 平均の揺れの目安（±2×標準偏差÷√回数）は、初めは隠し、押すと出す（必ずその中に入る範囲ではない）。
 * 記録にはセットごとの値（ks）が残っているので、実験をやり直さずに戻せる。
 */
/** 再生で1つの目盛りを見せる時間（ms） */
const REPLAY_MS = 900;

/** 縦軸の目盛り：lo〜hi に 3〜5 本の切りのよい値 */
function niceTicks(lo: number, hi: number): number[] {
  const span = Math.max(1e-9, hi - lo), raw = span / 4, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => span / x <= 5) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

export function Replay({ rec, theory, before, labels, unit = "", per = "セット" }: {
  rec: SetRecord; theory: number[];
  /** 前の条件の記録と理論（#121）。あると、割合を前と後で並べ、平均の線を2本にする */
  before?: { rec: SetRecord; theory: number[] };
  labels?: (string | number)[]; unit?: string;
  /** 1回の数え方（二項分布は n 回をまとめた「セット」、値の表は1回ずつの「回」） */
  per?: string;
}) {
  const N = rec.sets;
  const marks = useMemo(() => [...MARKS.filter((m) => m < N), N], [N]);
  const [t, setT] = useState(marks.length - 1);
  const [playing, setPlaying] = useState(false);
  const [showBand, setShowBand] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setT(marks.length - 1); }, [marks.length]);
  const play = () => {
    haptic(); setPlaying(true); setT(0);
    // 再生の速さは中身（何回目かを順に見せる）なので、動きを減らす設定でも飛ばさない（渡辺さん 2026-10-31：「再生を押すと一気に600まで飛ぶ」）。
    // 減らす設定で止めるのは、棒が伸びる・光るなどの飾りの動きだけ
    const step = (i: number) => { timer.current = setTimeout(() => { setT(i); if (i < marks.length - 1) step(i + 1); else setPlaying(false); }, REPLAY_MS); };
    step(1);
  };
  const upto = marks[Math.min(t, marks.length - 1)] ?? N;
  const freq = useMemo(() => freqOf(rec, upto), [rec, upto]);
  const freqB = useMemo(() => (before ? freqOf(before.rec, Math.min(upto, before.rec.sets)) : undefined), [before, upto]);
  // 平均の移り変わり（対数の目盛りで ~120 点）。左に縦軸の目盛り、右に期待値の名前と数
  const W = 340, H = 186, Rm = 76, T = 22, B = H - 34;
  const runOf = (r: SetRecord) => {
    const out: { i: number; m: number }[] = []; let sum = 0, next = 1;
    for (let i = 1; i <= r.sets; i++) { sum += r.ks[i - 1]!; if (i >= next || i === r.sets) { out.push({ i, m: sum / i }); next = Math.max(i + 1, Math.ceil(i * 1.06)); } }
    return out;
  };
  const series = useMemo(() => [
    ...(before ? [{ key: "b", name: "変更前", th: momentsOf(before.theory, before.rec.support), pts: runOf(before.rec), line: s.runLineB, dot: s.runDotB, mean: s.meanLineB }] : []),
    { key: "a", name: before ? "変更後" : "実験", th: momentsOf(theory, rec.support), pts: runOf(rec), line: s.runLine, dot: s.runDot, mean: s.meanLine },
  ], [rec, theory, before]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 縦の幅は、実際の平均の軌跡（全部の回数）と期待値だけで決める。再生中も固定する（動きが見比べられるように）。
  // 揺れの目安は補助なので幅に入れない（まれな大当たりの表では目安が非常に広く、平均の動きがつぶれていた。渡辺さん 2026-11-01）
  const ends = series.flatMap((x) => [x.th.mean, ...x.pts.map((p) => p.m)]);
  const lo0 = Math.min(...ends), hi0 = Math.max(...ends), span0 = hi0 - lo0 || Math.max(1, Math.abs(hi0) * 0.1), pad = span0 * 0.08;
  const lo = lo0 - pad, hi = hi0 + pad;
  const ticks = niceTicks(lo, hi);
  // 左の余白は目盛りの数の長さに合わせる（大きな値でも欠けない）
  const L = 10 + 6.4 * Math.max(...ticks.map((v) => num3(v).length));
  const lx = (i: number) => L + (Math.log10(i) / Math.max(1e-9, Math.log10(Math.max(10, N)))) * (W - L - Rm);
  const ly = (v: number) => B - ((Math.min(hi, Math.max(lo, v)) - lo) / Math.max(1e-9, hi - lo)) * (B - T);
  const curOf = (pts: { i: number; m: number }[]) => pts.filter((p) => p.i <= upto).at(-1);
  const a = series.at(-1)!, b = before ? series[0] : undefined, ca = curOf(a.pts), cb = b ? curOf(b.pts) : undefined;
  // 期待値の名前と数：2本が近いときは上下にずらして重ねない
  const thY = series.map((x) => ly(x.th.mean));
  const thLabelY = series.length === 2 && Math.abs(thY[0]! - thY[1]!) < 12
    ? (thY[0]! <= thY[1]! ? [thY[0]! - 4, thY[1]! + 10] : [thY[0]! + 10, thY[1]! - 4]) : thY.map((y) => y + 3.5);
  // 散らばりが非常に大きい表（まれな大当たり）：全部の回数でも揺れの目安が期待値の半分を超える（反例の答えと同じ物差し）
  const wild = series.some((x) => (2 * Math.sqrt(x.th.variance)) / Math.sqrt(Math.max(1, N)) > Math.abs(x.th.mean) / 2);
  const about = (v: number) => (Math.abs(Number(num3(v)) - v) > 1e-9 ? `約 ${num3(v)}` : num3(v));
  if (N < 2) return null;
  return (
    <section className={s.card} data-testid="exp-replay">
      <p className={s.h}>平均の移り変わり<span>何{per}目までの平均か（倍々の目盛り）</span></p>
      <div className={s.marks} role="radiogroup" aria-label={`何${per}目まで`}>
        {marks.map((m, i) => <button key={m} type="button" role="radio" aria-checked={i === t} onClick={() => { haptic(); setT(i); }}>{i === marks.length - 1 ? `全 ${m}` : m}</button>)}
        <button type="button" className={s.play} onClick={play} disabled={playing} aria-label={`1${per}目から再生`}>{playing ? "再生中" : "▶ 再生"}</button>
      </div>
      <p className={s.replayStat} data-testid="exp-replay-stat"><b>{upto}</b> {per}まで：
        {b ? <>実験平均 前 <b>{num3(cb?.m)}{unit}</b>・後 <b>{num3(ca?.m)}{unit}</b>／期待値 前 {num3(b.th.mean)}{unit}・後 {num3(a.th.mean)}{unit}</>
          : <>実験平均 <b>{num3(ca?.m)}{unit}</b>／期待値 {num3(a.th.mean)}{unit}</>}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={`ここまでの平均の移り変わり（横は${per}数の対数目盛）`} data-testid="exp-run-chart">
        <text x={2} y={11} className={s.axisTitle}>ここまでの平均{unit ? `（${unit}）` : ""}</text>
        <text x={W - Rm + 8} y={11} className={s.axisTitle}>期待値（破線）</text>
        {ticks.map((v) => (
          <g key={v}><line x1={L} x2={W - Rm + 4} y1={ly(v)} y2={ly(v)} className={s.grid} /><text x={L - 4} y={ly(v) + 3.5} textAnchor="end" className={s.tick}>{num3(v)}</text></g>
        ))}
        {showBand && series.map((x) => {
          const sd = Math.sqrt(x.th.variance), band = x.pts.filter((p) => p.i <= upto).map((p) => [lx(p.i), ly(x.th.mean + (2 * sd) / Math.sqrt(p.i)), ly(x.th.mean - (2 * sd) / Math.sqrt(p.i))] as const);
          return <path key={`band${x.key}`} d={`M${band.map(([bx, ba]) => `${bx},${ba}`).join("L")}L${[...band].reverse().map(([bx, , bb]) => `${bx},${bb}`).join("L")}Z`} className={x.key === "b" ? s.bandB : s.band} data-testid="exp-run-band" />;
        })}
        {series.map((x, j) => (
          <g key={x.key}>
            <line x1={L} x2={W - Rm + 4} y1={ly(x.th.mean)} y2={ly(x.th.mean)} className={x.mean} />
            <text x={W - Rm + 8} y={thLabelY[j]} className={s.tick} data-testid={`exp-run-expect-${x.key}`}>{b ? `${x.name.slice(-1)} ` : "期待値 "}{num3(x.th.mean)}</text>
            {/* 線は再生した回数までだけ描く（未来まで横に伸ばさない） */}
            <path d={x.pts.filter((p) => p.i <= upto).map((p, i) => `${i ? "L" : "M"}${lx(p.i)},${ly(p.m)}`).join("")} className={x.line} data-testid={`exp-run-line-${x.key}`} data-upto={upto} />
            {(() => { const c = curOf(x.pts); return c && <>
              <circle cx={lx(c.i)} cy={ly(c.m)} r={4} className={x.dot} />
              {b && <text x={Math.max(L + 2, lx(c.i) - 6)} y={ly(c.m) + (x.key === "a" ? (ly(c.m) <= ly(cb?.m ?? c.m) ? -8 : 14) : (ly(c.m) < ly(ca?.m ?? c.m) ? -8 : 14))} textAnchor="end" className={s.lineName} data-testid={`exp-run-name-${x.key}`}>{x.name}</text>}
            </>; })()}
          </g>
        ))}
        <line x1={L} x2={W - Rm + 4} y1={B} y2={B} className={s.base} />
        {MARKS.filter((m) => m <= Math.max(10, N)).map((m) => <text key={m} x={lx(m)} y={B + 13} textAnchor="middle" className={s.tick}>{m}</text>)}
        <text x={(L + W - Rm) / 2} y={H - 3} textAnchor="middle" className={s.axisTitle}>{per}数（対数目盛：1・3・10・30…と倍々に進む）</text>
      </svg>
      <button type="button" className={s.toggle} aria-pressed={showBand} onClick={() => { haptic(); setShowBand((v) => !v); }} data-testid="exp-run-band-toggle">{showBand ? "平均の揺れの目安を隠す" : "平均の揺れの目安を見る"}</button>
      {showBand && <p className={s.note}>帯＝平均の揺れの目安（期待値 ±2×標準偏差÷√{per}数。4倍集めると幅は半分）。いつも必ずこの中に入る範囲ではない。</p>}
      <p className={s.note} data-testid="exp-run-note">{b
        ? `${per}数が少ないうちは、平均が大きく揺れる。繰り返したとき、変更前は ${about(b.th.mean)}${unit}、変更後は ${about(a.th.mean)}${unit} の近くに落ち着いていくかを見る。途中では、2本の線が近づいたり交差したりすることもある。`
        : `${per}数が少ないうちは、平均が大きく揺れる。繰り返したとき、期待値 ${about(a.th.mean)}${unit} の近くに落ち着いていくかを見る。`}
        {wild && "この表は散らばりが非常に大きい（まれな大当たりがある）。しばらく低い平均が続き、当たりが出ると急に跳ねる。その跳ね方そのものが観察どころで、この回数では期待値の近くに落ち着くとは限らない。"}</p>
      <p className={s.h}>なぜ平均が変わったか<span>値ごとの割合（{upto} {per}まで）</span></p>
      <div className={s.legend} data-testid="exp-replay-legend">
        {b ? <><span><i className={s.kBarB} />変更前の実験の割合</span><span><i className={s.kBar} />変更後の実験の割合</span><span><i className={s.kGhost} />変更前の理論確率</span><span><i className={s.kDot} />変更後の理論確率</span></>
          : <><span><i className={s.kBar} />実験の割合</span><span><i className={s.kDot} />理論確率</span></>}
      </div>
      <Bars freq={freq} pair={freqB} theory={theory} ghost={before?.theory} labels={labels} height={120} label={`${upto} ${per}までの割合と理論確率`} />
    </section>
  );
}
