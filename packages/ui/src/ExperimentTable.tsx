// 値の表の実験室（#119）：くじ・さいころ・客単価のように、値と確率の表から1回ずつ引き、平均（期待値）を確かめる。
// 予測 → 実験 → 観察 → 理由 → 応用 は二項分布の実験室と同じ枠（labParts）。
// - 予想：表を変えると平均（▲）はどこへ動くか。向きと値は連動する（食い違った予想を入れられない）
// - 観察：平均が▲へ吸い寄せられる様子を、積み上がりの再生で見直す。期待値の値は実際には出ない（3.5）ことにも気づかせる
// - 理由：E(X)＝Σ x p(x) を、今の表の値で項に開いて計算する
// - 応用：反例を実験する（成り立つ条件「和が有限」を崩した表：平均が落ち着かない）。答えは表（モデル）から求める
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRandom, emptySetRecord, expand, modelMoments, modelPmf, runSets, summarize, supportOf, toTex, type Card, type CardMechanism, type FormulaNode, type SetRecord } from "@math-lab/engine";
import { nudge } from "./nudge";
import { useRunner } from "./runner";
import { haptic, reduced, useTween } from "./motion";
import { Sheet } from "./Sheet";
import type { FormulaData } from "./Formula";
import { Bars, LabShell, Replay, num3, r2, tex, usePairRuns, useStages } from "./labParts";
import { CompareStage, copyHere, hereUrl, useCards } from "./Compare";
import type { Props } from "./Experiment";
import s from "./Experiment.module.css";

export type TableTheme = {
  id: string; name: string; icon: string; unit?: string; story?: string;
  /** 値（くじの賞金・さいころの目）と、その呼び名（なければ値） */
  values: number[]; labels?: string[];
  /** 前の条件の重みと、問いで変えた重み（本数・確率の比） */
  start: number[]; compare: number[];
  /** 何を変えたかの文（「大当たりを 1 本から 3 本に」） */
  change: string;
};
export type TableDef = {
  id: string; version: number; title: string; question: string;
  links: { concepts?: string[]; relations?: string[] };
  model: "table";
  themes: TableTheme[];
  reason?: { title: string; concept?: string; formula?: number; steps: string[] };
  /** 反例を実験する：成り立つ条件（breaks）を崩した表で、平均がどうなるかを見る */
  counterexamples?: { id: string; name: string; breaks: string; values: number[]; weights: number[]; labels?: string[]; text: string; concept?: string }[];
  points?: string[];
};

const DIRS = ["左へ動く", "動かない", "右へ動く"] as const;
const tbl = (values: number[], weights: number[]) => ({ kind: "table" as const, n: 1 as const, values, weights });
const meanOf = (values: number[], weights: number[]) => modelMoments(tbl(values, weights)).mean;
/** 値の位置（並べた値のあいだを直線でつなぐ）。▲と予想の線を、棒の間に置くため */
const posOf = (v: number, xs: number[]) => {
  if (v <= xs[0]!) return 0;
  for (let i = 0; i < xs.length - 1; i++) if (v <= xs[i + 1]!) return i + (v - xs[i]!) / Math.max(1e-12, xs[i + 1]! - xs[i]!);
  return xs.length - 1;
};

function labelsFor(th: { values: number[]; labels?: string[] }, support: number[], unit = "") {
  return support.map((v) => { const i = th.values.indexOf(v); return th.labels?.[i] ?? `${v}${unit}`; });
}

/** 値の表を引き続ける記録（種つき・分けても同じ）。100回は20ずつ見せる */
function useDraws(values: number[], weights: number[]) {
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const rng = useRef(createRandom(seed));
  const [rec, setRec] = useState<SetRecord>(() => emptySetRecord(seed, tbl(values, weights)));
  const { start, stop } = useRunner();   // 実行中の更新は1か所で止める（止めた後の更新は捨てる。#142）
  const key = `${values.join(",")}|${weights.join(",")}`;
  useEffect(() => { stop(); const sd = Date.now() % 100000; setSeed(sd); rng.current = createRandom(sd); setRec(emptySetRecord(sd, tbl(values, weights))); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const run = (count: number, per = 10) => {
    haptic(); stop();
    if (count === 1 || reduced()) { setRec(runSets(rng.current, rec, count)); return; }   // 更新の関数の中で乱数を進めない
    let cur = rec, done = 0;
    start(() => { const m = Math.min(per, count - done); cur = runSets(rng.current, cur, m); done += m; setRec(cur); return done >= count; }, 60);
  };
  return { rec, run, seed };
}

/** 反例：成り立つ条件を崩した表で、平均が落ち着くかを予想 → 引き続ける → 照らす。答えは表（モデル）の散らばりから */
function TableCounter({ cx, unit, onConcept, name }: { cx: NonNullable<TableDef["counterexamples"]>[number]; unit: string; onConcept?: (id: string) => void; name: (id: string) => string }) {
  const SETTLE = ["落ち着く", "揺れ続ける"] as const;
  const [guess, setGuess] = useState<number | undefined>();
  const { rec, run } = useDraws(cx.values, cx.weights);
  const mm = modelMoments(tbl(cx.values, cx.weights)), support = rec.support, theory = modelPmf(tbl(cx.values, cx.weights));
  // 1000回引いても、平均のずれの目安（2×標準偏差÷√1000）が平均の半分を超えるなら「揺れ続ける」
  const answer = (2 * Math.sqrt(mm.variance)) / Math.sqrt(1000) > Math.abs(mm.mean) / 2 ? 1 : 0;
  const enough = rec.sets >= 300;
  const shown = cx.values.length > 8 ? `${cx.labels?.[0] ?? cx.values[0]}${unit}、${cx.labels?.[1] ?? cx.values[1]}${unit}、…、${cx.labels?.at(-1) ?? cx.values.at(-1)}${unit}（${cx.values.length} 通り）` : cx.values.map((v, i) => `${cx.labels?.[i] ?? v}${unit}`).join("・");
  return (
    <div className={s.cx} data-testid="exp-cx">
      <p className={s.how}><b>表</b>{shown}</p>
      <p className={s.h}>何度も引くと、平均は…</p>
      <div className={s.choice} role="radiogroup" aria-label="反例の予想" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {SETTLE.map((t, i) => <button key={t} type="button" role="radio" aria-checked={guess === i} onClick={() => { haptic(); setGuess(i); }}>{t}</button>)}
      </div>
      {guess !== undefined && <>
        <div className={s.two}>
          <button type="button" className={s.secondary} onClick={() => run(100, 20)} data-testid="exp-cx-run-1">100回</button>
          <button type="button" className={s.primary} onClick={() => run(1000, 50)} data-testid="exp-cx-run-100">▶ 1000回</button>
        </div>
        {rec.sets > 1 && <Replay rec={rec} theory={theory} labels={labelsFor(cx, support, unit)} unit={unit} per="回" />}
        {!enough ? <p className={s.muted}>あと {300 - rec.sets} 回で、表と照らす</p> : <>
          <div className={guess === answer ? s.ok : s.ng} data-testid="exp-cx-verdict">
            <b>{guess === answer ? "✓ 予想どおり" : "✗ 予想と違った"}</b>　平均は{SETTLE[answer]}（期待値 {num3(mm.mean)}{unit}・標準偏差 {num3(Math.sqrt(mm.variance))}{unit}）
          </div>
          <p className={s.breaks}>崩した条件：{cx.breaks}</p>
          <p className={s.note}>{cx.text}</p>
          {cx.concept && onConcept && <button type="button" className={s.link} onClick={() => onConcept(cx.concept!)}>{name(cx.concept)} を見る</button>}
        </>}
      </>}
    </div>
  );
}

/** 比べる（issue 122）：テーマの値の表で、重みを自分で決めたカードを並べる。テーマが変わると別の組（URL は「テーマ:カード」） */
function TableCompare({ def, theme, labels, unit, cards0, seed, sets, onCards, onDeck }: {
  def: TableDef; theme: TableTheme; labels: string[]; unit: string; cards0?: string; seed: number; sets: number;
  onCards?: (encoded: string) => void; onDeck: (cards: Card[]) => void;
}) {
  const deck = useCards({
    storeKey: `math-lab:cards:${def.id}:${theme.id}`, initial: cards0, values: theme.values, onCards: (e) => onCards?.(e ? `${theme.id}:${e}` : ""),
    start: () => [{ mechanism: tbl(theme.values, theme.start), sets, seed }, { mechanism: tbl(theme.values, theme.compare), sets, seed: seed + 1 }].filter((c) => c.sets > 0),
  });
  useEffect(() => { deck.ensure(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onDeck(deck.cards); }, [deck.cards]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [w, setW] = useState(theme.compare);
  const describe = (m: CardMechanism) => (m.kind === "table" ? `重み ${m.weights.map((x) => num3(x)).join("：")}` : "");
  const max = Math.max(10, ...theme.start, ...theme.compare) * 2;
  const stepOf = Math.max(1, Math.round(max / 20));
  return (
    <CompareStage deck={deck} describe={describe} draft={tbl(theme.values, w)} unit={unit} labels={labels} onShare={() => copyHere()}
      editor={<div className={s.cards}>{theme.values.map((v, i) => (
        <div key={v} className={s.wstep}>
          <span>{labels[i]}</span>
          <button type="button" aria-label={`${labels[i]} の重みを減らす`} disabled={w[i]! <= 0 || w.reduce((a, b) => a + b, 0) - Math.min(stepOf, w[i]!) <= 0} onClick={() => { haptic(); setW(w.map((x, j) => (j === i ? Math.max(0, x - stepOf) : x))); }}>−</button>
          <b data-testid={`cmp-w-${i}`}>{num3(w[i])}</b>
          <button type="button" aria-label={`${labels[i]} の重みを増やす`} disabled={w[i]! >= max} onClick={() => { haptic(); setW(w.map((x, j) => (j === i ? Math.min(max, x + stepOf) : x))); }}>＋</button>
        </div>
      ))}</div>} />
  );
}

export function TableLab({ def, reasonFormula, onConcept, conceptName, onSendMemo, onBack, cards: cards0, onCards }: Props & { def: TableDef }) {
  const { stage, reached, go } = useStages(cards0 ? 5 : 0);
  const [cmpTheme, cmpCards] = cards0?.includes(":") ? [cards0.slice(0, cards0.indexOf(":")), cards0.slice(cards0.indexOf(":") + 1)] : [undefined, undefined];
  const [theme, setTheme] = useState(def.themes.find((t) => t.id === cmpTheme) ?? def.themes[0]!);
  const [deckCards, setDeckCards] = useState<Card[]>([]);
  const unit = theme.unit ?? "";
  const startT = tbl(theme.values, theme.start), nextT = tbl(theme.values, theme.compare);
  const support = useMemo(() => supportOf(nextT), [theme]);   // eslint-disable-line react-hooks/exhaustive-deps
  const labels = labelsFor(theme, support, unit);
  const thStart = useMemo(() => modelPmf(startT), [theme]);   // eslint-disable-line react-hooks/exhaustive-deps
  const thNext = useMemo(() => modelPmf(nextT), [theme]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mStart = meanOf(theme.values, theme.start), mNext = meanOf(theme.values, theme.compare);
  const lo = Math.min(...theme.values), hi = Math.max(...theme.values);
  const step = Math.max(0.01, Number(((hi - lo) / 100).toPrecision(1)));
  // 予想：向きと平均の値は連動する
  const [pred, setPred] = useState<{ dir?: number; value: number }>({ value: mStart });
  useEffect(() => { setPred({ value: meanOf(theme.values, theme.start) }); }, [theme]);
  const dirOfV = (v: number) => (Math.abs(v - mStart) < step / 2 ? 1 : v > mStart ? 2 : 0);
  const chooseDir = (i: number) => setPred((p) => ({ dir: i, value: nudge(i, p.value, mStart, Math.max(step, (hi - lo) / 10), lo, hi) }));
  const actual = Math.abs(mNext - mStart) < step / 2 ? 1 : mNext > mStart ? 2 : 0;

  // 前の表と変えた表を、同じ回数ずつ引いて比べる（#121）
  const { before: recB, after: rec, run, seed } = usePairRuns(startT, nextT);
  const sum = summarize(rec), sumB = summarize(recB);
  const [meanT, meanBT] = useTween([sum.mean ?? 0, sumB.mean ?? 0]);
  const last = rec.ks.slice(-8), lastB = recB.ks.slice(-8);
  const [sheet, setSheet] = useState<"info" | null>(null);
  const [cxId, setCxId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const name = (id: string) => conceptName?.(id) ?? id;
  const chips = (ids: string[]) => <div className={s.chips}>{ids.map((id) => <button key={id} type="button" className={s.chip} onClick={() => onConcept?.(id)}>{name(id)}</button>)}</div>;
  const labelOf = (v: number) => labels[support.indexOf(v)] ?? `${v}${unit}`;

  // 理由：E(X)＝Σ x p(x) を今の表で項に開いて計算する（engine の domains・fns）
  const steps = useMemo(() => {
    const t = reasonFormula?.tree; if (!t) return [];
    const tot = theme.compare.reduce((a, b) => a + b, 0);
    const env = { domains: { x: support }, fns: { p: (x: number) => { const i = theme.values.indexOf(x); return i < 0 ? 0 : theme.compare[i]! / tot; } } };
    return expand(t, env);
  }, [reasonFormula, theme, support]);
  const [si, setSi] = useState(0);
  const num = (v: number) => String(Number(v.toPrecision(4)));
  const lhs = reasonFormula?.tree ? toTex((reasonFormula.tree as { args: FormulaNode[] }).args[0]!, { symbols: reasonFormula.symbols }) : "E(X)";

  const memoText = () => [
    "【学習記録】実験室", `実験：${def.title}（${def.id}）`, `問い：${def.question}`, `テーマ：${theme.name}（${theme.change}）`,
    `予想：平均は${pred.dir !== undefined ? DIRS[pred.dir] : "—"}（${r2(pred.value)}${unit}）`,
    `結果：各 ${rec.sets} 回・平均 前 ${r2(sumB.mean)} → 後 ${r2(sum.mean)}${unit}（期待値 ${r2(mStart)} → ${r2(mNext)}${unit}）・種 ${seed}`,
    ...(deckCards.length ? [`比べた表（${theme.values.map((v, i) => labels[support.indexOf(v)] ?? theme.labels?.[i] ?? v).join("・")} の重み）：${deckCards.map((c) => `${c.mechanism.kind === "table" ? c.mechanism.weights.join("：") : ""}（${c.sets} 回・種 ${c.seed}）`).join("、")}`, `再現の URL：${hereUrl()}`] : []),
    `メモ：${memo || "—"}`, `日時：${new Date().toISOString()}`, "→ この内容を Notion の学習記録（学習ログ）に記録してください。",
  ].join("\n");
  const send = () => {
    const t = memoText();
    if (onSendMemo) { onSendMemo(t); return; }
    try { void navigator.clipboard?.writeText(t); } catch { /* コピーできない環境では URL だけで渡す */ }
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(t)}`, "_blank", "noopener");
  };

  const themeChips = (
    <div className={s.themes} role="radiogroup" aria-label="テーマ">
      {def.themes.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === theme.id} onClick={() => { haptic(); setTheme(t); }}><span aria-hidden="true">{t.icon}</span>{t.name}</button>)}
    </div>
  );

  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      {themeChips}
      <section className={s.card}>
        <p className={s.h}>今の表<span>▲＝平均（期待値）{r2(mStart)}{unit}</span></p>
        {theme.story && <p className={s.story}>{theme.story}</p>}
        <Bars theory={thStart} labels={labels} marker={posOf(mStart, support)} mark={pred.dir !== undefined ? posOf(pred.value, support) : undefined} height={150} label="今の表の確率と平均" />
      </section>
      <section className={s.card}>
        <p className={s.h}>{theme.change}と、平均（▲）は…</p>
        <div className={s.choice} role="radiogroup" aria-label="予想">
          {DIRS.map((d, i) => <button key={d} type="button" role="radio" aria-checked={pred.dir === i} onClick={() => { haptic(); chooseDir(i); }}>{d}</button>)}
        </div>
        <label className={s.peak}>
          <span>平均はいくつになる？<small className={s.muted}>　今は {r2(mStart)}{unit}</small></span><b>{r2(pred.value)}{unit}</b>
          <input type="range" min={lo} max={hi} step={step} value={pred.value} onChange={(e) => { const v = Number(e.target.value); setPred({ dir: dirOfV(v), value: v }); }}
            style={{ "--fill": `${((pred.value - lo) / Math.max(1e-9, hi - lo)) * 100}%` } as CSSProperties} aria-label="予想する平均" />
        </label>
      </section>
    </>;
    cta = <button type="button" className={s.primary} disabled={pred.dir === undefined} onClick={() => go(1)}>{pred.dir === undefined ? "まず予想を選ぶ" : "この予想で引いてみる"}</button>;
  } else if (stage === 1) {
    body = <>
      <section className={s.card}>
        <p className={s.h}>{theme.change}<span>{theme.icon} {theme.name}</span></p>
        <div className={s.lanes}>
          {([["前の表", lastB, meanBT, s.laneB, "exp-draws-before", "exp-mean-before"], ["変えた表", last, meanT, s.laneA, "exp-draws", "exp-mean"]] as const).map(([tag, ls, m, cls, tid, mid]) => (
            <div key={tag} className={`${s.lane} ${cls}`}>
              <div className={s.laneHead}><b>{tag}</b>{rec.sets ? <span>平均 <em data-testid={mid}>{r2(m)}</em>{unit}</span> : <span className={s.muted}>まだ</span>}</div>
              <div className={s.draws} data-testid={tid} key={rec.sets}>
                {ls.length ? ls.map((v, i) => <span key={`${rec.sets}-${i}`} className={i === ls.length - 1 ? s.drawNew : s.draw}>{labelOf(v)}</span>) : <span className={s.muted}>—</span>}
              </div>
            </div>
          ))}
        </div>
        {!rec.sets && <p className={s.muted}>「1回」を押すと、前の表と変えた表から1つずつ引く</p>}
      </section>
      <section className={s.card}>
        <p className={s.h}>出た値の割合<span data-testid="exp-sets">各 {rec.sets} 回</span></p>
        <div className={s.legend}><span><i className={s.kBarB} />前の表</span><span><i className={s.kBar} />変えた表</span></div>
        <Bars freq={sum.freq} pair={sumB.freq} labels={labels} hi={last.length ? support.indexOf(last.at(-1)!) : undefined} label="前と変えた表で引いた値の割合" />
      </section>
    </>;
    cta = <>
      <div className={s.two}>
        <button type="button" className={s.secondary} onClick={() => run(1)} data-testid="exp-run-1">前と後 1回</button>
        <button type="button" className={s.primary} onClick={() => run(100)} data-testid="exp-run-100">▶ 各 100回</button>
      </div>
      <button type="button" className={s.next} disabled={rec.sets < 20} onClick={() => go(2)}>{rec.sets < 20 ? `あと ${20 - rec.sets} 回で観察できる` : "観察する →"}</button>
    </>;
  } else if (stage === 2) {
    const ok = pred.dir === actual;
    const notAValue = !theme.values.some((v) => Math.abs(v - mNext) < 1e-9);
    body = <>
      <div className={ok ? s.ok : s.ng} data-testid="exp-verdict">
        <b>{ok ? "✓ 予想どおり" : "✗ 予想と違った"}</b>　平均は{DIRS[actual]}（期待値 {r2(mStart)} → <b>{r2(mNext)}</b>{unit}。予想は {r2(pred.value)}{unit}）
        {notAValue && <span className={s.shape}>形にも注目：期待値 {r2(mNext)}{unit} は、表の中の値としては<b>一度も出ない</b>。「よく出る値」ではなく、何度も引いたときの平均の行き着く先</span>}
      </div>
      <section className={s.card}>
        <div className={s.legend}><span><i className={s.kBarB} />前の表で引いた</span><span><i className={s.kBar} />変えた表で引いた</span><span><i className={s.kGhost} />前の表の確率</span><span><i className={s.kDot} />変えた表の確率</span><span><i className={s.kGuess} />あなたの予想</span></div>
        <Bars freq={sum.freq} pair={sumB.freq} theory={thNext} ghost={thStart} labels={labels} marker={posOf(mNext, support)} mark={posOf(pred.value, support)} height={170} label="前と変えた表で引いた割合と表の確率と予想" />
      </section>
      <div className={s.tiles}>
        <div data-testid="exp-tile-exp">平均（引いた）<b>{r2(sumB.mean)} → {r2(sum.mean)}{unit}</b><i>差 {r2((sum.mean ?? 0) - (sumB.mean ?? 0))}・各 {rec.sets} 回</i></div>
        <div data-testid="exp-tile-theory">期待値（表から）<b>{r2(mStart)} → {r2(mNext)}{unit}</b><i>差 {r2(mNext - mStart)}</i></div>
      </div>
      <Replay rec={rec} theory={thNext} before={{ rec: recB, theory: thStart }} labels={labels} unit={unit} per="回" />
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ {r2(mNext)}{unit} になる？ 理由を考える</button>;
  } else if (stage === 3) {
    const shownStep = Math.min(si, Math.max(0, steps.length - 1));
    body = <>
      <section className={s.card}>
        <p className={s.h}>{def.reason?.title ?? "式で確かめる"}<span>{steps.length > 1 ? `${shownStep + 1}／${steps.length}` : ""}</span></p>
        {steps.length > 0 && <div className={s.math} data-testid="exp-expand" dangerouslySetInnerHTML={{ __html: tex(`${lhs}=${toTex(steps[shownStep]!, { symbols: reasonFormula?.symbols, num })}`) }} />}
        {steps.length > 1 && (
          <div className={s.two}>
            <button type="button" className={s.secondary} disabled={shownStep <= 0} onClick={() => setSi(shownStep - 1)} aria-label="前の段">‹ 前の段</button>
            <button type="button" className={s.secondary} disabled={shownStep >= steps.length - 1} onClick={() => setSi(shownStep + 1)} aria-label="次の段">次の段 ›</button>
          </div>
        )}
      </section>
      {def.reason?.steps.length ? <section className={s.card}><p className={s.h}>なぜそうなる？</p><ol className={s.steps}>{def.reason.steps.map((t) => <li key={t}>{t}</li>)}</ol></section> : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>別の条件で試す</button>;
  } else if (stage === 5) {
    body = <>
      <TableCompare key={theme.id} def={def} theme={theme} labels={labels} unit={unit} cards0={cmpTheme === theme.id ? cmpCards : undefined} seed={seed} sets={rec.sets} onCards={onCards} onDeck={setDeckCards} />
      <section className={s.card}>
        <p className={s.h}>発見メモ<span>ChatGPT に渡して学習記録へ</span></p>
        <textarea className={s.memo} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="気づいたこと・考えたこと（例：重い値の重みを増やすほど平均はそちらへ。重みを全部2倍にしても平均は変わらない）" aria-label="発見メモ" />
        <p className={s.muted}>比べた表と、同じ結果に戻れる URL もメモに入る。</p>
      </section>
      {def.links.concepts?.length ? <section className={s.card}><p className={s.h}>つながる概念</p>{chips(def.links.concepts)}</section> : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={send} data-testid="exp-send">メモを ChatGPT に送る</button>;
  } else {
    const cx = cxId ? def.counterexamples?.find((x) => x.id === cxId) : undefined;
    body = <>
      <section className={s.card}>
        <p className={s.h}>別のテーマで</p>
        {themeChips}
        <button type="button" className={s.rowBtn} onClick={() => go(0)}>{theme.icon} {theme.name}：{theme.change}</button>
      </section>
      {def.counterexamples?.length ? (
        <section className={s.card}>
          <p className={s.h}>反例を実験する<span>成り立つ条件を崩す</span></p>
          <div className={s.chips}>{def.counterexamples.map((x) => <button key={x.id} type="button" className={`${s.chip}${cxId === x.id ? ` ${s.on}` : ""}`} onClick={() => { haptic(); setCxId(x.id); }} data-testid={`exp-bnd-${x.id}`}>{x.name}</button>)}</div>
          {cx && <TableCounter key={cx.id} cx={cx} unit={unit} onConcept={onConcept} name={name} />}
        </section>
      ) : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(5)} data-testid="exp-to-compare">自分で表を決めて比べる →</button>;
  }

  return (
    <LabShell title={def.title} question={def.question} stage={stage} reached={reached} go={go} onBack={onBack} onInfo={() => setSheet("info")} body={body} cta={cta}>
      {sheet === "info" && (
        <Sheet label="基本と用語" title={def.title.replace(/ ?実験室$/, "の基本")} onClose={() => setSheet(null)} data-testid="exp-info">
          {reasonFormula?.tex && <div className={s.math} dangerouslySetInnerHTML={{ __html: tex(reasonFormula.tex) }} />}
          {def.points?.length ? <><p className={s.h}>ポイント</p><ul className={s.points}>{def.points.map((t) => <li key={t}>{t}</li>)}</ul></> : null}
          {def.links.concepts?.length ? <><p className={s.h}>関連する概念</p>{chips(def.links.concepts)}</> : null}
        </Sheet>
      )}
    </LabShell>
  );
}

export type { FormulaData };
