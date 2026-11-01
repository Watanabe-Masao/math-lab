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
  /** 前の結果で確率が変わる（独立でない）：前の結果の方へ carry だけ寄る。成功のあとは p＋carry(1−p)、失敗のあとは p−carry·p。
   *  平均は p のまま（どの回も成功の確率は p）、続けて同じ結果が出やすい（隣どうしの相関が carry）。最初は p */
  | { kind: "streak"; n: number; p: number; carry: number }
  /** セットごとに確率がばらつく（同じ p でない）：セットごとに p−d か p＋d を半々で選び、そのセットの中では同じ確率を使う。客や時間で買いやすさが違う、など。
   *  ずれ幅 d＝min(spread, p, 1−p)（mixSpread）。端で切り詰めると平均の確率が p からずれるので、ずれ幅の方を詰める（平均はいつも p。p＝0・1 では d＝0）。stats2-course #119・#118 層3 */
  | { kind: "mix"; n: number; p: number; spread: number }
  /** 値の表（くじ・さいころ）から n 回引き、値を足す（n＝1 なら1回の値）。weights は重み（合計で割って確率にする）。#119 */
  | { kind: "table"; n: number; values: number[]; weights: number[] };

/** 理論のモデル：k（0〜n）ごとの確率を式で出す */
export type Model =
  | { kind: "binom"; n: number; p: number }
  | { kind: "hyper"; n: number; total: number; success: number }
  | { kind: "table"; n: number; values: number[]; weights: number[] };

const isCount = (x: number) => Number.isInteger(x) && x >= 0;

/** 起き方の条件を確かめる（おかしければ理由を返す。よければ undefined） */
export function checkMechanism(m: Mechanism): string | undefined {
  if (!isCount(m.n) || m.n < 1) return `n は1以上の整数：${m.n}`;
  if (m.kind === "table") {
    if (!m.values.length || m.values.length !== m.weights.length) return "値と重みは同じ数（1つ以上）";
    if (m.values.some((v) => !Number.isFinite(v))) return "値は有限の数";
    if (m.weights.some((w) => !(w >= 0)) || !(m.weights.reduce((a, b) => a + b, 0) > 0)) return "重みは0以上で、合計が0より大きい";
    if (m.values.length ** Math.min(m.n, 8) > 1e6) return "値の数と回数が多すぎる（足した値の一覧が大きくなる）";
    return undefined;
  }
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
  if (m.kind === "table") {
    const tot = m.weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < m.n; i++) {
      let u = rng.next() * tot, j = 0;
      while (j < m.values.length - 1 && (u -= m.weights[j]!) >= 0) j++;
      while (m.weights[j] === 0 && j > 0) j--;   // 丸めで重み0の値に落ちたとき
      out.push(m.values[j]!);
    }
    return out;
  }
  if (m.kind === "urn") {
    let left = m.total, hit = m.success;
    for (let i = 0; i < m.n; i++) { const x = rng.next() < hit / left ? 1 : 0; out.push(x); hit -= x; left -= 1; }
    return out;
  }
  if (m.kind === "mix") {
    const d = mixSpread(m), q = m.p + (rng.next() < 0.5 ? -d : d);   // セットの最初に1回だけ選ぶ（試行ごとに選び直すと二項分布と同じになる）
    for (let i = 0; i < m.n; i++) out.push(rng.next() < q ? 1 : 0);
    return out;
  }
  let q = m.p;
  for (let i = 0; i < m.n; i++) {
    const x = rng.next() < q ? 1 : 0; out.push(x);
    q = m.p + m.carry * (x - m.p);
  }
  return out;
}

const lnFact = (() => { const t = [0]; return (k: number) => { for (let i = t.length; i <= k; i++) t[i] = t[i - 1]! + Math.log(i); return t[k]!; }; })();
const lnComb = (n: number, k: number) => (k < 0 || k > n ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k));

// 足した値の丸め（0.1+0.2 を 0.3 にそろえる）。桁数で丸める：小数点以下9桁で丸めると、大きな値（|v|＞約900万）で v×1e9 が倍精度の整数の範囲を越え、
// 値がずれていた（1e12＋14 などで分散が変わる。#142 の性質のテストで見つけた）
const key = (v: number) => Number(v.toPrecision(15));

/** 値の表を n 回引いて足した値の分布（たたみこみ）：とる値（小さい順）と確率 */
function tableSum(m: { n: number; values: number[]; weights: number[] }): { support: number[]; probs: number[] } {
  const tot = m.weights.reduce((a, b) => a + b, 0);
  let dist = new Map<number, number>([[0, 1]]);
  for (let i = 0; i < m.n; i++) {
    const next = new Map<number, number>();
    for (const [s, q] of dist) m.values.forEach((v, j) => { const w = m.weights[j]! / tot; if (w > 0) next.set(key(s + v), (next.get(key(s + v)) ?? 0) + q * w); });
    dist = next;
  }
  const support = [...dist.keys()].sort((a, b) => a - b);
  return { support, probs: support.map((x) => dist.get(x)!) };
}

/** とりうる値（記録の counts と、モデルの確率の並び）：0/1 の起き方は 0〜n、値の表は足した値の一覧 */
export function supportOf(m: Mechanism | Model): number[] {
  return m.kind === "table" ? tableSum(m).support : Array.from({ length: m.n + 1 }, (_, k) => k);
}

/** 理論のモデルの確率（supportOf の並び。0/1 の起き方は k＝0〜n。合計1） */
export function modelPmf(m: Model): number[] {
  if (m.kind === "table") return tableSum(m).probs;
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
  if (m.kind === "table") return { kind: "table", n: m.n, values: m.values, weights: m.weights };
  return undefined;
}

/** モデルの期待値・分散 */
export function modelMoments(m: Model): { mean: number; variance: number } {
  if (m.kind === "binom") return { mean: m.n * m.p, variance: m.n * m.p * (1 - m.p) };
  if (m.kind === "table") {
    const tot = m.weights.reduce((a, b) => a + b, 0);
    // 分散は平均からのずれの2乗で求める（E(X²)−μ² の引き算は、近い大きな値で桁が落ちる：10億と10億＋1 で 0 になっていた。#142）
    const mu = m.values.reduce((s, v, j) => s + v * m.weights[j]! / tot, 0);
    const v2 = m.values.reduce((s, v, j) => s + (v - mu) ** 2 * m.weights[j]! / tot, 0);
    return { mean: m.n * mu, variance: m.n * v2 };
  }
  const q = m.success / m.total, fpc = m.total > 1 ? (m.total - m.n) / (m.total - 1) : 0;
  return { mean: m.n * q, variance: m.n * q * (1 - q) * fpc };
}

/** 混ざる起き方のずれ幅 d＝min(spread, p, 1−p)。平均の確率を p に保つ */
export function mixSpread(m: { p: number; spread: number }): number {
  return Math.max(0, Math.min(m.spread, m.p, 1 - m.p));
}

/** 起き方そのものの期待値・分散（1セットの成功の回数か、値の表の足した値）。理論のモデル（二項分布）とのずれを、実験の結果ではなく式で決める
 *  （予想の答え・反例の言い分の元。stats2-course #118 層3・5）。
 *  - 引きずられる：各回の平均は p、隣どうしの相関は carry、i 回目と j 回目の共分散は p(1−p)·carry^|i−j|。
 *    分散＝p(1−p){n＋2Σ_{h=1}^{n−1}(n−h)carry^h}
 *  - 混ざる：セットの確率 Q は p±d を半々。E(k)＝np、V(k)＝E(V(k|Q))＋V(E(k|Q))＝n(p(1−p)−d²)＋n²d²＝np(1−p)＋n(n−1)d² */
export function mechanismMoments(m: Mechanism): { mean: number; variance: number } {
  const bad = checkMechanism(m);
  if (bad) throw new RangeError(bad);
  if (m.kind === "bernoulli" || m.kind === "urn" || m.kind === "table") return modelMoments(modelOf(m)!);
  const pq = m.p * (1 - m.p);
  if (m.kind === "mix") { const d = mixSpread(m); return { mean: m.n * m.p, variance: m.n * pq + m.n * (m.n - 1) * d * d }; }
  let lag = 0, c = 1;
  for (let h = 1; h < m.n; h++) { c *= m.carry; lag += (m.n - h) * c; }
  return { mean: m.n * m.p, variance: pq * (m.n + 2 * lag) };
}

/** 記録（版2）。sets はセットの数、ks はセットごとの値（成功の回数か、値の表の足した値）、counts は support の値ごとのセット数。
 *  版2 で support（とりうる値）を足した（版1 は 0/1 の起き方だけで、support＝0〜n と同じ）。#119 */
export type SetRecord = {
  version: 2;
  support: number[];
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
  const support = supportOf(mechanism);
  return { version: 2, support, seed, mechanism, sets: 0, ks: [], counts: Array(support.length).fill(0), last: null, sum: 0, sumSq: 0 };
}

/** count セットを起こして記録に足す（元の記録は変えない） */
export function runSets(rng: Random, rec: SetRecord, count: number): SetRecord {
  if (!isCount(count)) throw new RangeError(`セットの数は0以上の整数：${count}`);
  const ks = [...rec.ks], counts = [...rec.counts], at = new Map(rec.support.map((x, i) => [key(x), i]));
  let { sum, sumSq } = rec, last = rec.last;
  for (let i = 0; i < count; i++) {
    const s = drawSet(rng, rec.mechanism), k = key(s.reduce((a, b) => a + b, 0));
    ks.push(k); counts[at.get(k)!]! += 1; sum += k; sumSq += k * k; last = s;
  }
  return { ...rec, sets: rec.sets + count, ks, counts, last, sum, sumSq };
}

/** 記録のまとめ：平均・分散（標本の n で割る）・k ごとの割合 */
export function summarize(rec: SetRecord): { mean: number | undefined; variance: number | undefined; freq: number[] } {
  const n = rec.sets;
  if (!n) return { mean: undefined, variance: undefined, freq: rec.counts.map(() => 0) };
  // 平均と分散は値の一覧（ks）から、最初の値からのずれで求める（大きな値の足し算・sumSq/n − 平均² の引き算は桁が落ちる。#142）
  const k0 = rec.ks[0] ?? 0;
  const mean = k0 + rec.ks.reduce((s, k) => s + (k - k0), 0) / n;
  const variance = rec.ks.reduce((s, k) => s + (k - mean) ** 2, 0) / n;
  return { mean, variance, freq: rec.counts.map((c) => c / n) };
}
