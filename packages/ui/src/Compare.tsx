// 比べるの段（stats2-course #122）：学習者が自分で決めた条件を記録カードに残し、いくつも重ねて比べる。
// カードは条件と種とセット数だけ（engine の Card）。記録は開くたびにカードから作り直す（同じ種なら同じ結果）。
// 保存は3つの段：その端末のブラウザ（消えることがある前提）・URL（onCards で親が URL に書く）・発見メモ（親が送る）。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_CARDS, decodeCards, encodeCards, modelMoments, modelOf, recordOfCard, summarize, type Card, type CardMechanism, type Mechanism } from "@math-lab/engine";
import { haptic } from "./motion";
import { Bars, SERIES, num3 } from "./labParts";
import s from "./Experiment.module.css";

export const MAX_SHOWN = 4;

/** ブラウザの保存（その端末だけ。読めない・書けない環境でも画面は動く） */
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* 保存できない環境では URL とメモだけで残す */ } },
};

/** カードの一覧と、重ねて見る選び（4つまで）。最初は URL、なければブラウザの保存、なければ start（前と後など） */
export function useCards({ storeKey, initial, values, start, onCards }: {
  storeKey: string; initial?: string; values?: number[]; start: () => Card[]; onCards?: (encoded: string) => void;
}) {
  const [cards, setCards] = useState<Card[]>(() => {
    const fromUrl = initial ? decodeCards(initial, { values }) : [];
    if (fromUrl.length) return fromUrl;
    const saved = decodeCards(store.get(storeKey) ?? "", { values });
    return saved;
  });
  const [shown, setShown] = useState<number[]>(() => cards.slice(0, MAX_SHOWN).map((_, i) => i));
  const seeded = useRef(cards.length > 0);
  /** 比べるの段に入ったとき、まだカードがなければ start（前と後の実験）から始める */
  const ensure = () => {
    if (seeded.current) return;
    seeded.current = true;
    const st = start();
    setCards(st); setShown(st.slice(0, MAX_SHOWN).map((_, i) => i));
  };
  const enc = encodeCards(cards);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (!initial) return; }
    store.set(storeKey, enc); onCards?.(enc);
  }, [enc]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** 足したカードは重ねて見る方に入れる（4つを超えたら古い選びから外す）。カードは8枚まで（URL に入る数） */
  const add = (c: Card) => {
    if (cards.length >= MAX_CARDS) return;
    const i = cards.length;
    setCards([...cards, c]); setShown((sh) => [...sh, i].slice(-MAX_SHOWN));
  };
  const toggle = (i: number) => setShown((sh) => (sh.includes(i) ? sh.filter((x) => x !== i) : [...sh, i].slice(-MAX_SHOWN)));
  const remove = (i: number) => { setCards((cs) => cs.filter((_, j) => j !== i)); setShown((sh) => sh.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))); };
  const more = (i: number, sets: number) => setCards((cs) => cs.map((c, j) => (j === i ? { ...c, sets: Math.min(100000, c.sets + sets) } : c)));
  return { cards, shown, add, toggle, remove, more, ensure, encoded: enc };
}

export function CompareStage({ deck, describe, editor, draft, unit = "", labels, onShare }: {
  deck: ReturnType<typeof useCards>;
  /** カードの条件の短い名前（「n＝10・p＝0.8」） */
  describe: (m: CardMechanism) => string;
  /** 条件を決める所（n・p のつまみ、重みの ±） */
  editor: ReactNode;
  /** 今決めている条件 */
  draft: CardMechanism;
  unit?: string; labels?: (string | number)[];
  /** この組を渡す（URL をコピーするなど） */
  onShare?: () => void;
}) {
  const { cards, shown, add, toggle, remove, more } = deck;
  const [copied, setCopied] = useState(false);
  // 記録はカードから作り直す（同じカードなら同じ記録）
  const recs = useMemo(() => cards.map(recordOfCard), [cards]);
  const view = shown.filter((i) => i < cards.length);
  const freqs = view.map((i) => summarize(recs[i]!).freq);
  const len = Math.max(0, ...freqs.map((f) => f.length));
  const theoryOf = (m: CardMechanism) => modelMoments(modelOf(m as Mechanism)!);
  const save = (sets: number) => { haptic(); add({ mechanism: draft, sets, seed: Date.now() % 100000 }); };
  return <>
    <section className={s.card}>
      <p className={s.h}>条件を決める<span>{describe(draft)}</span></p>
      {editor}
      <div className={s.two}>
        <button type="button" className={s.secondary} onClick={() => save(20)} disabled={cards.length >= MAX_CARDS} data-testid="cmp-save-20">20セットで保存</button>
        <button type="button" className={s.primary} onClick={() => save(100)} disabled={cards.length >= MAX_CARDS} data-testid="cmp-save-100">▶ 100セットで保存</button>
      </div>
      {cards.length >= MAX_CARDS && <p className={s.muted}>カードは {MAX_CARDS} 枚まで。いらないカードを × で消すと保存できる</p>}
    </section>
    <section className={s.card}>
      <p className={s.h}>記録カード<span>重ねて見るのは {MAX_SHOWN} つまで</span></p>
      {cards.length ? (
        <div className={s.cards} data-testid="cmp-cards">
          {cards.map((c, i) => {
            const at = view.indexOf(i), m = summarize(recs[i]!);
            return (
              <div key={`${i}-${c.seed}`} className={s.cardRow} aria-checked={at >= 0} data-testid="cmp-card">
                <button type="button" role="checkbox" aria-checked={at >= 0} className={s.cardPick} onClick={() => { haptic(); toggle(i); }}>
                  <i className={`${s.swatch} ${at >= 0 ? SERIES[at] : ""}`} aria-hidden="true" />
                  <span>{describe(c.mechanism)}<small>{c.sets} セット・平均 {num3(m.mean)}{unit}・種 {c.seed}</small></span>
                </button>
                <button type="button" className={s.cardDel} onClick={() => { haptic(); more(i, 100); }} aria-label={`${describe(c.mechanism)} をあと100セット`}>＋100</button>
                <button type="button" className={s.cardDel} onClick={() => { haptic(); remove(i); }} aria-label={`${describe(c.mechanism)} を消す`}>×</button>
              </div>
            );
          })}
        </div>
      ) : <p className={s.muted}>まだカードがない。条件を決めて保存すると、ここに並ぶ</p>}
    </section>
    {view.length > 0 && (
      <section className={s.card} data-testid="cmp-view">
        <p className={s.h}>重ねて比べる</p>
        <div className={s.legend}>{view.map((i, j) => <span key={i}><i className={`${s.kBar} ${SERIES[j]}`} style={{ opacity: 1 }} />{describe(cards[i]!.mechanism)}</span>)}</div>
        <Bars series={freqs.map((f) => [...f, ...Array(Math.max(0, len - f.length)).fill(0)])} labels={labels} height={150} label="選んだカードの実験の割合" />
        <table className={s.cmpTable} data-testid="cmp-table">
          <thead><tr><th scope="col">条件</th><th scope="col">平均<small>実験（理論）</small></th><th scope="col">散らばり<small>実験（理論）</small></th></tr></thead>
          <tbody>
            {view.map((i, j) => {
              const m = summarize(recs[i]!), t = theoryOf(cards[i]!.mechanism);
              return (
                <tr key={i}>
                  <td><i className={`${s.swatch} ${SERIES[j]}`} style={{ display: "inline-block", marginRight: 6, verticalAlign: -1 }} aria-hidden="true" />{describe(cards[i]!.mechanism)}<small>{cards[i]!.sets} セット</small></td>
                  <td>{num3(m.mean)}<small>（{num3(t.mean)}）</small></td>
                  <td>{num3(m.variance)}<small>（{num3(t.variance)}）</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={s.note}>散らばりは分散（ずれの2乗の平均）。条件を1つずつ変えたカードを並べると、平均と散らばりがどう動くかの決まりが見えてくる。</p>
        {onShare && <button type="button" className={s.share} onClick={() => { onShare(); setCopied(true); setTimeout(() => setCopied(false), 2000); }} data-testid="cmp-share" aria-live="polite">{copied ? "✓ コピーした" : "この組を URL でコピー"}<span>開けば同じ結果に戻る</span></button>}
      </section>
    )}
  </>;
}

/** 今の URL（比べている組が cmp に入っている。親が書く） */
export const hereUrl = () => { try { return window.location.href; } catch { return ""; } };
/** 今の URL をコピーする（コピーできない環境では何もしない） */
export const copyHere = () => { haptic(); try { void navigator.clipboard?.writeText(hereUrl()); } catch { /* コピーできない環境 */ } };
