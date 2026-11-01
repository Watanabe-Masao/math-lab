// 記録カード（stats2-course #122）：実験室の「比べる」の段で、学習者が決めた条件を残す。
// 残すのは条件と種とセット数だけ。種つき乱数なので、同じカードからはいつでも同じ記録が作り直せる（平均・散らばり・山は開くたびに計算する）。
// URL に入れられる短い文字にする（例：b10_0.5_100_74290 ＝ n＝10・p＝0.5・100 セット・種 74290）。
import { createRandom } from "./random";
import { checkMechanism, emptySetRecord, runSets, type Mechanism, type SetRecord } from "./lab";

/** カードにできる起き方：独立で毎回同じ p（二項分布）と、値の表から1回引く（値は実験の定義から入るので、カードは重みだけ持つ） */
export type CardMechanism = { kind: "bernoulli"; n: number; p: number } | { kind: "table"; n: 1; values: number[]; weights: number[] }
  /** 前提を崩した起き方（stats2-course #161：比べるを実験室に1か所にし、起き方も選べるカードにする） */
  | { kind: "streak"; n: number; p: number; carry: number } | { kind: "mix"; n: number; p: number; spread: number }
  | { kind: "fatigue"; n: number; p: number; drop: number } | { kind: "urn"; n: number; total: number; success: number };
export type Card = { mechanism: CardMechanism; sets: number; seed: number };

/** カード1枚が持てるセット数の上限（URL から大きすぎる数を入れられて画面が止まらないように） */
export const MAX_CARD_SETS = 100000;
/** 共有カードの1セットの回数（n）の上限と、作り直すときに起こす回の合計（n×セット数）の上限。
 *  URL は誰でも書けるので、開いたときに大きな配列・計算で画面が固まらないようにする（#142：n＝10億が受理されていた） */
export const MAX_CARD_N = 1000;
export const MAX_CARD_DRAWS = 2_000_000;
/** URL に入れるカードの数の上限 */
export const MAX_CARDS = 8;

const num = (v: number) => String(Number(v.toPrecision(12)));

/** 1枚を短い文字に（値の表の値は入れない。定義から入る） */
export function encodeCard(c: Card): string {
  const m = c.mechanism;
  const head = m.kind === "bernoulli" ? `b${m.n}_${num(m.p)}` : m.kind === "table" ? `t${m.weights.map(num).join("~")}`
    : m.kind === "streak" ? `s${m.n}_${num(m.p)}_${num(m.carry)}` : m.kind === "mix" ? `m${m.n}_${num(m.p)}_${num(m.spread)}`
    : m.kind === "fatigue" ? `f${m.n}_${num(m.p)}_${num(m.drop)}` : `u${m.n}_${m.total}_${m.success}`;
  return `${head}_${c.sets}_${c.seed}`;
}

export function encodeCards(cs: Card[]): string {
  return cs.slice(0, MAX_CARDS).map(encodeCard).join(",");
}

const isInt = (s: string) => /^\d+$/.test(s);
const isNum = (s: string) => /^\d+(\.\d+)?(e-?\d+)?$/.test(s);

/** 文字から1枚に戻す。形が違う・条件が成り立たない・大きすぎるときは undefined（理由は言わずに捨てる。URL は誰でも書けるので） */
export function decodeCard(s: string, ctx: { values?: number[] } = {}): Card | undefined {
  const parts = s.split("_");
  if (parts.length < 3) return undefined;
  const [seedS, setsS] = [parts.at(-1)!, parts.at(-2)!];
  if (!isInt(seedS) || !isInt(setsS)) return undefined;
  const sets = Number(setsS), seed = Number(seedS);
  if (sets > MAX_CARD_SETS || seed > 2 ** 32) return undefined;
  let mechanism: CardMechanism;
  if (s[0] === "b" && parts.length === 4) {
    const nS = parts[0]!.slice(1), pS = parts[1]!;
    if (!isInt(nS) || !isNum(pS)) return undefined;
    mechanism = { kind: "bernoulli", n: Number(nS), p: Number(pS) };
  } else if ("smf".includes(s[0]!) && parts.length === 5) {
    const nS = parts[0]!.slice(1), pS = parts[1]!, xS = parts[2]!;
    if (!isInt(nS) || !isNum(pS) || !isNum(xS)) return undefined;
    const n = Number(nS), p = Number(pS), x = Number(xS);
    mechanism = s[0] === "s" ? { kind: "streak", n, p, carry: x } : s[0] === "m" ? { kind: "mix", n, p, spread: x } : { kind: "fatigue", n, p, drop: x };
  } else if (s[0] === "u" && parts.length === 5) {
    const [nS, tS, hS] = [parts[0]!.slice(1), parts[1]!, parts[2]!];
    if (!isInt(nS) || !isInt(tS) || !isInt(hS)) return undefined;
    mechanism = { kind: "urn", n: Number(nS), total: Number(tS), success: Number(hS) };
  } else if (s[0] === "t" && parts.length === 3 && ctx.values) {
    const ws = parts[0]!.slice(1).split("~");
    if (!ws.every(isNum) || ws.length !== ctx.values.length) return undefined;
    mechanism = { kind: "table", n: 1, values: ctx.values, weights: ws.map(Number) };
  } else return undefined;
  if (checkMechanism(mechanism as Mechanism)) return undefined;
  if (mechanism.n > MAX_CARD_N || mechanism.n * sets > MAX_CARD_DRAWS) return undefined;
  return { mechanism, sets, seed };
}

export function decodeCards(s: string, ctx: { values?: number[] } = {}): Card[] {
  if (!s) return [];
  return s.split(",").slice(0, MAX_CARDS).map((x) => decodeCard(x, ctx)).filter((c): c is Card => c !== undefined);
}

/** カードから記録を作り直す（同じカードなら、いつ・何回に分けて起こしても同じ記録） */
export function recordOfCard(c: Card): SetRecord {
  return runSets(createRandom(c.seed), emptySetRecord(c.seed, c.mechanism as Mechanism), c.sets);
}
