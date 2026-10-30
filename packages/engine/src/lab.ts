// 実験室のエンジン v0（stats2-course #102・#115。計画の 6「構想と、そこへ向かう骨格」）。画面を持たない純粋関数。
//
// 骨格（形を後で変えない）
// - 起き方（Mechanism）と理論のモデル（Model）を分ける。同じ画面で「二項分布の理論 × 戻さずに取る起き方」を並べると、
//   ずれがそのまま「この計算が使えない場面」になる。
// - 1セット＝n 回の 0/1 の並び（表・裏、買った・買わない）。画面はこの並びを見せ、成功の回数 k を積み上げる。
// - 記録（SetRecord）は型を決める：種・起き方・セットごとの k・k ごとの回数・最後の並び・合計。
//   次の手法（推定・検定）や次の概念の実験にそのまま渡せる。版（version）を持ち、形を変えるときは上げる。
// - 同じ種なら、何回に分けて起こしても同じ結果（100セット＝10セット×10）。
import type { Random } from "./random";

/** 起き方：1セットで n 回の 0/1 をどう起こすか */
export type Mechanism =
  /** 独立で、毎回同じ確率 p（二項分布の前提どおり） */
  | { kind: "bernoulli"; n: number; p: number }
  /** 箱（全部で total 個、うち当たり success 個）から、戻さずに n 個取る（超幾何分布） */
  | { kind: "urn"; n: number; total: number; success: number }
  /** 前の結果で確率が変わる（独立でない）：成功のあとは p＋carry、失敗のあとは p−carry（0〜1 に収める）。最初は p */
  | { kind: "streak"; n: number; p: number; carry: number }
  /** セットごとに確率がばらつく（同じ p でない）：セットごとに p−spread か p＋spread を半々で選ぶ（0〜1 に収める）。客や時間で買いやすさが違う、など */
  | { kind: "mix"; n: number; p: number; spread: number };

/** 理論のモデル：k（0〜n）ごとの確率を式で出す */
export type Model =
  | { kind: "binom"; n: number; p: number }
  | { kind: "hyper"; n: number; total: number; success: number };

const isCount = (x: number) => Number.isInteger(x) && x >= 0;

/** 起き方の条件を確かめる（おかしければ理由を返す。よければ undefined） */
export function checkMechanism(m: Mechanism): string | undefined {
  if (!isCount(m.n) || m.n < 1) return `n は1以上の整数：${m.n}`;
  if (m.kind === "urn") {
    if (!isCount(m.total) || !isCount(m.success)) return "箱の数と当たりの数は0以上の整数";
    if (m.success > m.total) return `当たり（${m.success}）は全部（${m.total}）以下`;
    if (m.n > m.total) return `戻さずに取るので、取る数（${m.n}）は全部（${m.total}）以下`;
    return undefined;
  }
  if (!(m.p >= 0 && m.p <= 1)) return `p は 0〜1：${m.p}`;
  if (m.kind === "streak" && !(m.carry >= 0 && m.carry <= 1)) return `carry は 0〜1：${m.carry}`;
  if (m.kind === "mix" && !(m.spread >= 0 && m.spread <= 1)) return `spread は 0〜1：${m.spread}`;
  return undefined;
}

/** 1セットを起こす：n 回の 0/1 の並び */
export function drawSet(rng: Random, m: Mechanism): number[] {
  const bad = checkMechanism(m);
  if (bad) throw new RangeError(bad);
  const out: number[] = [];
  if (m.kind === "bernoulli") { for (let i = 0; i < m.n; i++) out.push(rng.next() < m.p ? 1 : 0); return out; }
  if (m.kind === "urn") {
    let left = m.total, hit = m.success;
    for (let i = 0; i < m.n; i++) { const x = rng.next() < hit / left ? 1 : 0; out.push(x); hit -= x; left -= 1; }
    return out;
  }
  if (m.kind === "mix") {
    const q = Math.min(1, Math.max(0, m.p + (rng.next() < 0.5 ? -m.spread : m.spread)));
    for (let i = 0; i < m.n; i++) out.push(rng.next() < q ? 1 : 0);
    return out;
  }
  let q = m.p;
  for (let i = 0; i < m.n; i++) {
    const x = rng.next() < q ? 1 : 0; out.push(x);
    q = Math.min(1, Math.max(0, m.p + (x ? m.carry : -m.carry)));
  }
  return out;
}

const lnFact = (() => { const t = [0]; return (k: number) => { for (let i = t.length; i <= k; i++) t[i] = t[i - 1]! + Math.log(i); return t[k]!; }; })();
const lnComb = (n: number, k: number) => (k < 0 || k > n ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k));

/** 理論のモデルの、k＝0〜n の確率（合計1） */
export function modelPmf(m: Model): number[] {
  const out: number[] = [];
  for (let k = 0; k <= m.n; k++) {
    if (m.kind === "binom") {
      if (m.p === 0 || m.p === 1) { out.push(k === (m.p === 1 ? m.n : 0) ? 1 : 0); continue; }
      out.push(Math.exp(lnComb(m.n, k) + k * Math.log(m.p) + (m.n - k) * Math.log(1 - m.p)));
    } else {
      out.push(Math.exp(lnComb(m.success, k) + lnComb(m.total - m.success, m.n - k) - lnComb(m.total, m.n)));
    }
  }
  return out;
}

/** 起き方に合う理論のモデル（独立でない起き方には式がないので undefined） */
export function modelOf(m: Mechanism): Model | undefined {
  if (m.kind === "bernoulli") return { kind: "binom", n: m.n, p: m.p };
  if (m.kind === "urn") return { kind: "hyper", n: m.n, total: m.total, success: m.success };
  return undefined;
}

/** モデルの期待値・分散 */
export function modelMoments(m: Model): { mean: number; variance: number } {
  if (m.kind === "binom") return { mean: m.n * m.p, variance: m.n * m.p * (1 - m.p) };
  const q = m.success / m.total, fpc = m.total > 1 ? (m.total - m.n) / (m.total - 1) : 0;
  return { mean: m.n * q, variance: m.n * q * (1 - q) * fpc };
}

/** 記録（版1）。sets はセットの数、ks はセットごとの成功の回数、counts は k ごとのセット数（長さ n＋1） */
export type SetRecord = {
  version: 1;
  seed: number;
  mechanism: Mechanism;
  sets: number;
  ks: number[];
  counts: number[];
  last: number[] | null;
  sum: number;
  sumSq: number;
};

export function emptySetRecord(seed: number, mechanism: Mechanism): SetRecord {
  return { version: 1, seed, mechanism, sets: 0, ks: [], counts: Array(mechanism.n + 1).fill(0), last: null, sum: 0, sumSq: 0 };
}

/** count セットを起こして記録に足す（元の記録は変えない） */
export function runSets(rng: Random, rec: SetRecord, count: number): SetRecord {
  if (!isCount(count)) throw new RangeError(`セットの数は0以上の整数：${count}`);
  const ks = [...rec.ks], counts = [...rec.counts];
  let { sum, sumSq } = rec, last = rec.last;
  for (let i = 0; i < count; i++) {
    const s = drawSet(rng, rec.mechanism), k = s.reduce((a, b) => a + b, 0);
    ks.push(k); counts[k]! += 1; sum += k; sumSq += k * k; last = s;
  }
  return { ...rec, sets: rec.sets + count, ks, counts, last, sum, sumSq };
}

/** 記録のまとめ：平均・分散（標本の n で割る）・k ごとの割合 */
export function summarize(rec: SetRecord): { mean: number | undefined; variance: number | undefined; freq: number[] } {
  const n = rec.sets;
  if (!n) return { mean: undefined, variance: undefined, freq: rec.counts.map(() => 0) };
  const mean = rec.sum / n;
  return { mean, variance: Math.max(0, rec.sumSq / n - mean * mean), freq: rec.counts.map((c) => c / n) };
}
