// 実験室 v0（stats2-course #102）：予測 → 実験 → 観察 → 理由 → 応用 を、スマホでは1画面に1段ずつ。
// - 実験の定義（ExperimentDef）はデータ。画面は読むだけ（テーマ・使えない場面・次の問いは定義を足すだけで増える）
// - 予想するまで結果を見せない。予想の答えは定義に書かず、理論のモデルから求める
// - 起き方（engine の Mechanism）と理論のモデルを分ける：反例は、成り立つ条件を1つ崩した起き方で、二項の理論とのずれを見る
// - 発見メモは ChatGPT に渡す（公開サイトは個人の記録を持たない。ChatGPT が Notion の学習記録へ書く）
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  expand, mechanismMoments, mixSpread, modelMoments, modelPmf, summarize, toTex,
  type CardMechanism, type Mechanism, type SetRecord,
} from "@math-lab/engine";
import { nudge } from "./nudge";
import { haptic } from "./motion";
import { Bars, LabShell, Replay, pct, peak, r2, tex, usePairRuns, useStages } from "./labParts";
import { TableLab, type TableDef } from "./ExperimentTable";
import { CompareStage, copyHere, hereUrl, useCards } from "./Compare";
import { Sheet } from "./Sheet";
import { LabInfo } from "./LabInfo";
import { Formula, type FormulaData } from "./Formula";
import { Workspace, type WorkspaceData } from "./Workspace";
import s from "./Experiment.module.css";

type Cond = { n: number; p: number };
type Range = { min: number; max: number; step: number };
export type ExperimentTheme = { id: string; name: string; icon: string; success: string; failure: string; unit?: string; p?: number; story?: string };
/** 実験室の定義。model で形が分かれる（binom：成功の回数の山、table：値の表の平均。#119） */
export type ExperimentDef = BinomDef | TableDef;
export type BinomDef = {
  id: string; version: number; title: string; question: string;
  links: { concepts?: string[]; relations?: string[] };
  model: "binom";
  vary: { n: Range; p: Range };
  start: Cond; compare: Partial<Cond>;
  reason?: { title: string; concept?: string; formula?: number; steps: string[] };
  themes: ExperimentTheme[];
  /** 反例を実験する：成り立つ条件（breaks）を1つ崩した起き方で、理論とのずれを見る。数は概念しだい */
  counterexamples?: { id: string; name: string; breaks: string; mechanism: { kind: "urn" | "streak" | "mix"; total?: number; success?: number; carry?: number; spread?: number }; text: string; concept?: string }[];
  next?: { question: string; set: Partial<Cond> }[];
  points?: string[];
};

export type Props = {
  def: ExperimentDef;
  /** 理由の段で使う式（定義の reason.concept の reason.formula。E(X)＝np など） */
  reasonFormula?: FormulaData;
  /** ⓘ に出す主役の式（P(X＝k)＝…） */
  mainFormula?: FormulaData;
  seed?: number;
  onConcept?: (id: string) => void;
  conceptName?: (id: string) => string;
  /** 発見メモを送る（既定：ChatGPT を開いて文を渡す） */
  onSendMemo?: (text: string) => void;
  /** 戻る（概念のページへ） */
  onBack?: () => void;
  /** 概念の式（記号を定義の式で開く。E → Σ k P(X＝k) など） */
  definitions?: (conceptId: string) => FormulaData[];
  /** 理由の段に置く式の作業台（概念の workspace と同じもの。今の条件の値で始める） */
  workspace?: { formula: WorkspaceData; mean?: FormulaData; vary: string[]; over: string };
  /** 比べるの記録カード（URL の cmp。あれば比べるの段から開く）。issue 122 */
  cards?: string;
  /** 記録カードが変わったとき（親が URL に書く） */
  onCards?: (encoded: string) => void;
};

const DIRS = ["左へ動く", "動かない", "右へ動く"] as const;
const mean = (c: Cond) => modelMoments({ kind: "binom", ...c }).mean;

type Counter = NonNullable<BinomDef["counterexamples"]>[number];
const SPREAD = ["狭くなる", "変わらない", "広くなる"] as const;
const pct1 = (v: number) => `${Number((v * 100).toFixed(1))}%`;   // 2.5% のような割合（丸めて別の値に見せない）

/** 反例を実験する：起き方だけ変えて、予想 → 実験（並びが出て積み上がる）→ 二項分布の理論と照らす。結果と説明は実験のあとに出す */
function CounterLab({ cx, cond, theme, onConcept, name }: { cx: Counter; cond: Cond; theme: ExperimentTheme; onConcept?: (id: string) => void; name: (id: string) => string }) {
  const total = Math.max(cond.n, cx.mechanism.total ?? 40);
  const m: Mechanism = cx.mechanism.kind === "urn" ? { kind: "urn", n: cond.n, total, success: cx.mechanism.success ?? Math.round(cond.p * total) }
    : cx.mechanism.kind === "streak" ? { kind: "streak", n: cond.n, p: cond.p, carry: cx.mechanism.carry ?? 0.3 }
    : { kind: "mix", n: cond.n, p: cond.p, spread: cx.mechanism.spread ?? 0.2 };
  // 起き方の説明（結果は言わない）
  // 比べる二項分布は、崩した起き方と同じ当たりの割合にそろえる（戻さずに取るは、箱の当たりの数を丸めるので割合 q＝当たり÷全部 が p とずれる。
  // 戻す・戻さないの違いだけを見るため、条件どおりの列と理論も q で起こす。渡辺さん 2026-11-01）
  const base: Cond = m.kind === "urn" ? { n: cond.n, p: m.success / m.total } : cond;
  const how = m.kind === "urn" ? `${total} 個の箱（${theme.success} ${m.success} 個）から、${cond.n} 個を戻さずに取る。指定した確率 ${pct1(cond.p)}・箱の当たりの割合 ${pct1(base.p)}。この ${pct1(base.p)} で、戻す場合（条件どおり）と戻さない場合を比べる`
    : m.kind === "streak" ? `${theme.success}のあとは確率 ${r2(cond.p + m.carry * (1 - cond.p))}、${theme.failure}のあとは ${r2(cond.p - m.carry * cond.p)}（最初は ${r2(cond.p)}。どの回も平均すると ${r2(cond.p)}）`
    : `セットごとに確率が ${r2(cond.p - mixSpread(m))} か ${r2(cond.p + mixSpread(m))} になり、そのセットの中は同じ確率（平均の確率は ${r2(cond.p)}${mixSpread(m) === 0 ? "。p が 0 か 1 なので、ずれ幅は 0" : ""}）`;
  const [guess, setGuess] = useState<number | undefined>();
  // 条件どおり（独立・毎回同じ p＝二項分布の前提）と、条件を1つ崩した起き方を、同じセット数ずつ起こして比べる（issue 121）
  const { before: recB, after: rec, run, fresh } = usePairRuns({ kind: "bernoulli", ...base }, m);
  const sm = summarize(rec), smB = summarize(recB), binom = modelPmf({ kind: "binom", ...base }), bv = modelMoments({ kind: "binom", ...base }).variance;
  // 予想の答えは実験の結果ではなく、起き方の理論の散らばり（mechanismMoments）と二項分布の理論で決める（実験の結果は毎回ゆれる。stats2-course #118 層5）
  const mm = mechanismMoments(m);
  const actual = Math.abs(mm.variance - bv) <= 1e-9 * Math.max(1, bv) ? 1 : mm.variance < bv ? 0 : 2;
  const enough = rec.sets >= 100;
  const kOf = (r: SetRecord) => r.last?.reduce((a, b) => a + b, 0);
  return (
    <div className={s.cx} data-testid="exp-cx">
      <p className={s.how}><b>起き方</b>{how}</p>
      <p className={s.h}>条件どおりの二項分布と比べて、山の広がりは？</p>
      <div className={s.choice} role="radiogroup" aria-label="反例の予想">
        {SPREAD.map((t, i) => <button key={t} type="button" role="radio" aria-checked={guess === i} onClick={() => { haptic(); setGuess(i); }}>{t}</button>)}
      </div>
      {guess !== undefined && <>
        <div className={s.lanes}>
          {([["条件どおり（二項分布）", recB, s.laneB, "exp-cx-set-before"], [`条件を崩した：${cx.name}`, rec, s.laneA, "exp-cx-set"]] as const).map(([tag, r, cls, tid]) => (
            <div key={tid} className={`${s.lane} ${cls}`}>
              <div className={s.laneHead}><b>{tag}</b>{kOf(r) === undefined ? <span className={s.muted}>まだ</span> : <span>{theme.success} <em>{kOf(r)}</em> {theme.unit ?? "回"}</span>}</div>
              <div className={s.set} key={fresh} data-testid={tid}>
                {(r.last ?? Array(cond.n).fill(null)).map((v, i) => (
                  <span key={i} className={v === null ? s.slot : v ? s.hit : s.miss} style={{ "--i": i } as CSSProperties}>{v === null ? "" : v ? theme.icon : "・"}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={s.legend}><span><i className={s.kBarB} />条件どおり</span><span><i className={s.kBar} />条件を崩した</span><span><i className={s.kDot} />二項分布の理論</span><span className={s.muted}>各 {rec.sets} セット</span></div>
        <Bars freq={sm.freq} pair={smB.freq} theory={binom} height={130} label={`条件どおりと${cx.name}の実験と二項分布の理論`} />
        <div className={s.two}>
          <button type="button" className={s.secondary} onClick={() => run(1, 20)} data-testid="exp-cx-run-1">両方 1セット</button>
          <button type="button" className={s.primary} onClick={() => run(100, 20)} data-testid="exp-cx-run-100">▶ 各 100セット</button>
        </div>
        {!enough ? <p className={s.muted}>あと {100 - rec.sets} セットで、二項分布と照らす</p> : <>
          <div className={guess === actual ? s.ok : s.ng} data-testid="exp-cx-verdict">
            <b>{guess === actual ? "✓ 予想どおり" : "✗ 予想と違った"}</b>　山は二項分布より{SPREAD[actual]}（理論の散らばり：崩した起き方 {r2(mm.variance)}・二項分布 {r2(bv)}。実験：崩した {r2(sm.variance)}・条件どおり {r2(smB.variance)}）
          </div>
          <div className={s.tiles}>
            <div>平均<b>{r2(smB.mean)} ・ {r2(sm.mean)}</b><i>条件どおり・崩した（理論 {r2(mean(base))}・{r2(mm.mean)}）</i></div>
            <div>散らばり<b>{r2(smB.variance)} ・ {r2(sm.variance)}</b><i>{actual === 1 ? "この条件では、理論の平均も散らばりも二項分布と同じ（差が出ない所）" : `理論の平均は同じで、散らばりは二項分布より${actual === 0 ? "小さい" : "大きい"}`}</i></div>
          </div>
          <p className={s.breaks}>崩した条件：{cx.breaks}</p>
          <p className={s.note}>{cx.text}</p>
          {cx.concept && onConcept && <button type="button" className={s.link} onClick={() => onConcept(cx.concept!)}>{name(cx.concept)} を見る</button>}
        </>}
      </>}
    </div>
  );
}

export function Experiment(props: Props) {
  return props.def.model === "table" ? <TableLab {...props} def={props.def} /> : <BinomLab {...props} def={props.def} />;
}

function BinomLab({ def, reasonFormula, mainFormula, seed: seed0, onConcept, conceptName, onSendMemo, onBack, definitions, workspace, cards: cards0, onCards }: Props & { def: BinomDef }) {
  const { stage, reached, go: go0 } = useStages(cards0 ? 5 : 0);

  // 問いの組（前の条件 → 変える条件）。応用の段の「次の問い」で入れ替わる
  const [round, setRound] = useState<{ question: string; start: Cond; next: Cond }>(() => ({ question: def.question, start: def.start, next: { ...def.start, ...def.compare } }));
  const [theme, setTheme] = useState(def.themes[0]!);
  const [cond, setCond] = useState<Cond>(round.next);
  const [pred, setPred] = useState<{ dir?: number; peak: number }>({ peak: Math.round(mean(round.start)) });
  const [sheet, setSheet] = useState<"info" | "cond" | null>(null);

  // 実験（種つき。同じ種なら同じ結果）：前の条件と変えた条件を、同じセット数ずつ起こして比べる（#121）。条件を変えたら記録を分ける
  const mech = (c: Cond): Mechanism => ({ kind: "bernoulli", n: c.n, p: c.p });
  const { before: recB, after: rec, run, seed, fresh } = usePairRuns(mech(round.start), mech(cond), seed0);
  const changeCond = (c: Cond) => setCond(c);
  const sum = summarize(rec), sumB = summarize(recB);
  const theoryNow = useMemo(() => modelPmf({ kind: "binom", ...cond }), [cond.n, cond.p]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 前の条件の山。次の条件で n が増えるときは、横軸を次の n まで伸ばす（予想の頂点を同じ図に置けるように）
  const theoryStart = useMemo(() => { const f = modelPmf({ kind: "binom", ...round.start }); return [...f, ...Array(Math.max(0, round.next.n - round.start.n)).fill(0)]; }, [round]);
  // 予想は1つの答えにそろえる：向きと山の頂点は連動する（右へ＝頂点が今の頂点より右）。どちらを触っても、もう一方が合わせて動く
  const base = peak(modelPmf({ kind: "binom", ...round.start }));
  const dirOfPeak = (k: number) => (k > base ? 2 : k < base ? 0 : 1);
  const chooseDir = (i: number) => setPred((p) => ({ dir: i, peak: nudge(i, p.peak, base, 1, 0, round.next.n) }));
  const choosePeak = (k: number) => setPred({ dir: dirOfPeak(k), peak: k });
  // あなたの予想の山：前の山の形のまま、頂点を予想の位置へずらす（形は変わらないと仮定した予想）。観察で理論と重ね、形の変化に気づく
  const guess = useMemo(() => {
    const f = modelPmf({ kind: "binom", ...round.start }), d = pred.peak - base;
    const g = Array.from({ length: round.next.n + 1 }, (_, k) => f[k - d] ?? 0), t = g.reduce((a, b) => a + b, 0) || 1;
    return g.map((v) => v / t);
  }, [round, pred.peak, base]);
  const spread = (f: number[]) => { const m = f.reduce((a, v, k) => a + k * v, 0); return f.reduce((a, v, k) => a + (k - m) ** 2 * v, 0); };
  const k = rec.last ? rec.last.reduce((a, b) => a + b, 0) : undefined;
  const kB = recB.last ? recB.last.reduce((a, b) => a + b, 0) : undefined;
  const theoryB = useMemo(() => modelPmf({ kind: "binom", ...round.start }), [round]);

  // 比べる（issue 122）：自分で決めた条件を記録カードに残し、いくつも重ねる。最初は前と後の実験のカードから始める
  const deck = useCards({
    storeKey: `math-lab:cards:${def.id}`, initial: cards0, onCards,
    start: () => [{ mechanism: { kind: "bernoulli" as const, ...round.start }, sets: recB.sets, seed }, { mechanism: { kind: "bernoulli" as const, ...cond }, sets: rec.sets, seed: seed + 1 }].filter((c) => c.sets > 0),
  });
  const go = (i: number) => { if (i === 5) deck.ensure(); go0(i); };
  const [draft, setDraft] = useState<Cond>(() => cond);
  const describe = (m: CardMechanism) => (m.kind === "bernoulli" ? `n＝${m.n}・p＝${r2(m.p)}` : "");

  // 反例を実験する：同じ n・p で、成り立つ条件を1つ崩した起き方にして、二項の理論と比べる
  const [cxId, setCxId] = useState<string | null>(null);

  // 発見メモ → ChatGPT
  const [memo, setMemo] = useState("");
  // 答えは予想と同じ物差し（山の頂点）で決める（stats2-course issue 158 A4：平均の差で決めると、頂点で正しく予想しても「違った」になる条件がある）
  const actual = dirOfPeak(peak(modelPmf({ kind: "binom", ...round.next })));
  const memoText = () => [
    "【学習記録】実験室", `実験：${def.title}（${def.id}）`, `問い：${round.question}`, `テーマ：${theme.name}`,
    `条件：n＝${round.start.n}・p＝${round.start.p} → n＝${cond.n}・p＝${cond.p}`,
    `予想：${pred.dir !== undefined ? DIRS[pred.dir] : "—"}（山の頂点 k＝${pred.peak}）`,
    `結果：各 ${rec.sets} セット・平均 前 ${r2(sumB.mean)} → 後 ${r2(sum.mean)}（理論 ${r2(mean(round.start))} → ${r2(mean(cond))}）・種 ${seed}`,
    ...(deck.cards.length ? [`比べた条件：${deck.cards.map((c) => `${describe(c.mechanism)}（${c.sets} セット・種 ${c.seed}）`).join("、")}`, `再現の URL：${hereUrl()}`] : []),
    `メモ：${memo || "—"}`, `日時：${new Date().toISOString()}`,
    "→ この内容を Notion の学習記録（学習ログ）に記録してください。",
  ].join("\n");
  const send = () => {
    const t = memoText();
    if (onSendMemo) { onSendMemo(t); return; }
    try { void navigator.clipboard?.writeText(t); } catch { /* コピーできない環境では URL だけで渡す */ }
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(t)}`, "_blank", "noopener");
  };

  const name = (id: string) => conceptName?.(id) ?? id;
  const chips = (ids: string[]) => <div className={s.chips}>{ids.map((id) => <button key={id} type="button" className={s.chip} onClick={() => onConcept?.(id)}>{name(id)}</button>)}</div>;

  const reasonTex = useMemo(() => {
    const t = reasonFormula?.tree; if (!t) return undefined;
    const steps = expand(t, { values: { n: cond.n, p: cond.p } });
    const lhs = (t as { args?: unknown[] }).args?.[0];
    const parts = [lhs ? toTex(lhs as never, { symbols: reasonFormula.symbols }) : "", ...steps.map((x) => toTex(x, { symbols: reasonFormula.symbols }))];
    return parts.filter((v, i, a) => v && a.indexOf(v) === i).join("=");
  }, [reasonFormula, cond.n, cond.p]);

  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      <section className={s.card}>
        <p className={s.h}>{`p＝${pct(round.start.p)}・n＝${round.start.n} のときの山`}<span>前の条件</span></p>
        <Bars theory={theoryStart} hi={base} guess={pred.dir !== undefined ? guess : undefined} mark={pred.dir !== undefined ? pred.peak : undefined} height={130} label="前の条件の理論の分布と予想の山" />
        {pred.dir !== undefined && <div className={s.legend}><span><i className={s.kBar} />前の条件</span><span><i className={s.kGuess} />あなたの予想の山</span></div>}
      </section>
      <section className={s.card}>
        <p className={s.h}>{`${round.next.p !== round.start.p ? `p＝${pct(round.next.p)}` : `n＝${round.next.n}`} にすると、山は…`}</p>
        <div className={s.choice} role="radiogroup" aria-label="予想">
          {DIRS.map((d, i) => <button key={d} type="button" role="radio" aria-checked={pred.dir === i} disabled={(i === 0 && base === 0) || (i === 2 && base >= round.next.n)} onClick={() => { haptic(); chooseDir(i); }}>{d}</button>)}
        </div>
        <label className={s.peak}>
          <span>山のいちばん高い所は？<small className={s.muted}>　今は k＝{base}</small></span><b>k＝{pred.peak}</b>
          <input type="range" min={0} max={round.next.n} step={1} value={pred.peak} onChange={(e) => choosePeak(Number(e.target.value))}
            style={{ "--fill": `${(pred.peak / round.next.n) * 100}%` } as CSSProperties} aria-label="予想する山の頂点" />
        </label>
      </section>
    </>;
    cta = <button type="button" className={s.primary} disabled={pred.dir === undefined} onClick={() => { changeCond(round.next); go(1); }}>{pred.dir === undefined ? "まず予想を選ぶ" : "この予想で実験する"}</button>;
  } else if (stage === 1) {
    body = <>
      <div className={s.themes} role="radiogroup" aria-label="テーマ">
        {def.themes.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === theme.id} onClick={() => { haptic(); setTheme(t); }}><span aria-hidden="true">{t.icon}</span>{t.name}</button>)}
      </div>
      <section className={s.card}>
        <p className={s.h}>いまの1セット<span>{theme.icon}＝{theme.success}</span></p>
        {theme.story && <p className={s.story}>{theme.story.replace("n ", `${cond.n} `)}</p>}
        <div className={s.lanes}>
          {([["前", round.start, recB, kB, s.laneB, "exp-set-before"], ["後", cond, rec, k, s.laneA, "exp-set"]] as const).map(([tag, c, r, kk, cls, tid]) => (
            <div key={tag} className={`${s.lane} ${cls}`}>
              <div className={s.laneHead}><b>{tag}：p＝{pct(c.p)}・n＝{c.n}</b>{kk === undefined ? <span className={s.muted}>まだ</span> : <span>{theme.success} <em>{kk}</em> {theme.unit ?? "回"}（{c.n} {theme.unit ?? "回"}中）</span>}</div>
              <div className={s.set} key={fresh} data-testid={tid}>
                {(r.last ?? Array(c.n).fill(null)).map((v, i) => (
                  <span key={i} className={v === null ? s.slot : v ? s.hit : s.miss} style={{ "--i": i } as CSSProperties} title={v === null ? "" : v ? theme.success : theme.failure}>
                    {v === null ? "" : v ? theme.icon : "・"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {k === undefined && <p className={s.muted}>「1セット」を押すと、前と後で {cond.n} {theme.unit ?? "回"}ずつ起こる</p>}
      </section>
      <section className={s.card}>
        <p className={s.h}>{`${theme.success}の数ごとの割合`}<span data-testid="exp-sets">各 {rec.sets} セット</span></p>
        <div className={s.legend}><span><i className={s.kBarB} />前 p＝{pct(round.start.p)}</span><span><i className={s.kBar} />後 p＝{pct(cond.p)}</span></div>
        <Bars freq={sum.freq} pair={sumB.freq} hi={k} label="前と後の実験の結果の割合" />
      </section>
      <div className={s.conds}><span className={s.chip}>n＝{cond.n}</span><span className={`${s.chip} ${s.on}`}>p＝{r2(cond.p)}</span><button type="button" className={s.chip} onClick={() => setSheet("cond")}>条件を変える ▾</button></div>
    </>;
    cta = <>
      <div className={s.two}>
        <button type="button" className={s.secondary} onClick={() => run(1)} data-testid="exp-run-1">前と後 1セット</button>
        <button type="button" className={s.primary} onClick={() => run(100)} data-testid="exp-run-100">▶ 各 100セット</button>
      </div>
      <button type="button" className={s.next} disabled={rec.sets < 20} onClick={() => go(2)}>{rec.sets < 20 ? `あと ${20 - rec.sets} セットで観察できる` : "観察する →"}</button>
    </>;
  } else if (stage === 2) {
    const ok = pred.dir === actual, pk = peak(theoryNow);
    body = <>
      <div className={ok ? s.ok : s.ng} data-testid="exp-verdict">
        <b>{ok ? "✓ 予想どおり" : "✗ 予想と違った"}</b>　山は{DIRS[actual]}（いちばん高いのは k＝{pk}。予想は k＝{pred.peak}）
        {(() => {   // 形の違い：予想は前の形のままずらした山。理論の散らばりと比べる
          const r = spread(theoryNow) / Math.max(1e-9, spread(guess));
          return r < 0.85 ? <span className={s.shape}>形にも注目：山は予想より<b>細く高く</b>なった（散らばり {r2(spread(theoryNow))}、前は {r2(spread(guess))}）</span>
            : r > 1.15 ? <span className={s.shape}>形にも注目：山は予想より<b>広く低く</b>なった（散らばり {r2(spread(theoryNow))}、前は {r2(spread(guess))}）</span> : null;
        })()}
      </div>
      <section className={s.card}>
        <div className={s.legend}><span><i className={s.kBarB} />前の実験</span><span><i className={s.kBar} />後の実験</span><span><i className={s.kGhost} />前の理論</span><span><i className={s.kDot} />後の理論</span><span><i className={s.kGuess} />あなたの予想</span></div>
        <Bars freq={sum.freq} pair={sumB.freq} theory={theoryNow} ghost={theoryB} guess={guess} hi={pk} height={170} label="前と後の実験と理論とあなたの予想" />
      </section>
      <div className={s.tiles}>
        <div data-testid="exp-tile-exp">平均（実験）<b>{r2(sumB.mean)} → {r2(sum.mean)}</b><i>差 {r2((sum.mean ?? 0) - (sumB.mean ?? 0))}・各 {rec.sets} セット</i></div>
        <div data-testid="exp-tile-theory">平均（理論）<b>{r2(mean(round.start))} → {r2(mean(cond))}</b><i>差 {r2(mean(cond) - mean(round.start))}・n×p で求める</i></div>
      </div>
      <Replay rec={rec} theory={theoryNow} before={{ rec: recB, theory: theoryB }} />
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ {r2(mean(cond))} になる？ 理由を考える</button>;
  } else if (stage === 3) {
    body = <>
      <section className={s.card}>
        <p className={s.h}>{def.reason?.title ?? "式で確かめる"}</p>
        {reasonTex && <div className={s.math} dangerouslySetInnerHTML={{ __html: tex(reasonTex) }} />}
        {reasonFormula?.tree && (
          // 式を展開する：記号を押すと意味と今の値、「開く」で定義の式へ（E → 値×確率の和）。今の条件の値で1段ずつ計算する
          <div className={s.formula} data-testid="exp-reason-formula">
            <Formula formula={reasonFormula} values={{ n: cond.n, p: cond.p }} definitions={definitions} onConcept={onConcept} conceptName={conceptName} />
          </div>
        )}
      </section>
      {def.reason?.steps.length ? (
        <section className={s.card}>
          <p className={s.h}>なぜそうなる？</p>
          <ol className={s.steps}>{def.reason.steps.map((t) => <li key={t}>{t}</li>)}</ol>
        </section>
      ) : null}
      {workspace ? (
        // 式を動かして確かめる：概念のページと同じ作業台を、今の条件（n・p）と予想の頂点（k）で始める。実験はこの実験室でしたので作業台の実験は出さない
        <section className={s.ws} data-testid="exp-workspace">
          <p className={s.h}>式を動かして確かめる<span>かたまりを押す・分解する・p を動かす</span></p>
          <Workspace key={`${cond.n}-${cond.p}`} formula={workspace.formula} mean={workspace.mean} vary={workspace.vary} over={workspace.over}
            initial={{ n: cond.n, p: cond.p, [workspace.over]: peak(theoryNow) }} definitions={definitions} onConcept={onConcept} conceptName={conceptName} experiment={false} />
        </section>
      ) : def.reason?.concept && onConcept ? (
        <button type="button" className={s.cardLink} onClick={() => onConcept(def.reason!.concept!)}>
          <b>式を動かして確かめる</b><span>{name(def.reason.concept)} の作業台：かたまりを押すと意味と値、p を動かすと山が動く</span>
        </button>
      ) : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>別の条件で試す</button>;
  } else if (stage === 5) {
    body = <>
      <CompareStage deck={deck} describe={describe} draft={{ kind: "bernoulli", ...draft }} onShare={() => copyHere()}
        editor={(["n", "p"] as const).map((key) => {
          const r = def.vary[key], v = draft[key];
          return (
            <label key={key} className={s.peak}>
              <span>{key === "n" ? "回数 n" : "成功確率 p"}</span><b>{key === "p" ? r2(v) : v}</b>
              <input type="range" min={r.min} max={r.max} step={r.step} value={v} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                style={{ "--fill": `${((v - r.min) / (r.max - r.min)) * 100}%` } as CSSProperties} aria-label={`比べる条件の ${key}`} data-testid={`cmp-${key}`} />
            </label>
          );
        })} />
      <section className={s.card}>
        <p className={s.h}>発見メモ<span>ChatGPT に渡して学習記録へ</span></p>
        <textarea className={s.memo} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="気づいたこと・考えたこと（例：n を2倍にすると散らばりも2倍。p＝0.5 で散らばりがいちばん大きい）" aria-label="発見メモ" />
        <p className={s.muted}>比べた条件と、同じ結果に戻れる URL もメモに入る。</p>
      </section>
      {def.links.concepts?.length ? <section className={s.card}><p className={s.h}>つながる概念</p>{chips(def.links.concepts)}</section> : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={send} data-testid="exp-send">メモを ChatGPT に送る</button>;
  } else {
    const cx = cxId ? def.counterexamples?.find((x) => x.id === cxId) : undefined;
    body = <>
      {def.next?.length ? (
        <section className={s.card}>
          <p className={s.h}>次の問い</p>
          {def.next.map((nx) => (
            <button key={nx.question} type="button" className={s.rowBtn} onClick={() => {
              const st = { ...cond }, nt = { ...cond, ...nx.set };
              setRound({ question: nx.question, start: st, next: nt }); setPred({ peak: Math.round(mean(st)) }); setCxId(null); go(0);
            }}>{nx.question}</button>
          ))}
        </section>
      ) : null}
      {def.counterexamples?.length ? (
        <section className={s.card}>
          <p className={s.h}>反例を実験する<span>成り立つ条件を1つ崩す</span></p>
          <div className={s.chips}>{def.counterexamples.map((x) => <button key={x.id} type="button" className={`${s.chip}${cxId === x.id ? ` ${s.on}` : ""}`} onClick={() => { haptic(); setCxId(x.id); }} data-testid={`exp-bnd-${x.id}`}>{x.name}</button>)}</div>
          {cx && <CounterLab key={`${cx.id}-${cond.n}-${cond.p}`} cx={cx} cond={cond} theme={theme} onConcept={onConcept} name={name} />}
        </section>
      ) : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(5)} data-testid="exp-to-compare">自分で条件を決めて比べる →</button>;
  }

  return (
    <LabShell title={def.title} question={round.question} stage={stage} reached={reached} go={go} onBack={onBack} onInfo={() => setSheet("info")} body={body} cta={cta}>
      {sheet === "info" && (
        <LabInfo title={def.title} points={def.points} main={def.reason?.concept ?? def.links.concepts?.[0]} related={def.links.concepts} name={name} onConcept={onConcept} onClose={() => setSheet(null)}
          formula={workspace
            ? <Workspace only="formula" formula={workspace.formula} vary={workspace.vary} over={workspace.over} initial={{ n: cond.n, p: cond.p, [workspace.over]: peak(theoryNow) }} definitions={definitions} onConcept={onConcept} conceptName={conceptName} experiment={false} />
            : mainFormula?.tex && <div className={s.math} dangerouslySetInnerHTML={{ __html: tex(mainFormula.tex) }} />} />
      )}
      {sheet === "cond" && (
        <Sheet label="条件を変える" title="条件を変える" onClose={() => setSheet(null)} data-testid="exp-cond">
          {(["n", "p"] as const).map((key) => {
            const r = def.vary[key], v = cond[key];
            return (
              <label key={key} className={s.peak}>
                <span>{key === "n" ? "回数 n" : "成功確率 p"}</span><b>{key === "p" ? r2(v) : v}</b>
                <input type="range" min={r.min} max={r.max} step={r.step} value={v} onChange={(e) => changeCond({ ...cond, [key]: Number(e.target.value) })}
                  style={{ "--fill": `${((v - r.min) / (r.max - r.min)) * 100}%` } as CSSProperties} aria-label={key} data-testid={`exp-cond-${key}`} />
              </label>
            );
          })}
          <p className={s.h}>テーマの p で試す</p>
          <div className={s.chips}>{def.themes.filter((t) => t.p !== undefined).map((t) => <button key={t.id} type="button" className={s.chip} onClick={() => { setTheme(t); changeCond({ ...cond, p: t.p! }); }}>{t.icon} {t.name}（{pct(t.p!)}）</button>)}</div>
          <p className={s.muted}>変えるのは「後」の条件。前の条件（p＝{pct(round.start.p)}・n＝{round.start.n}）はそのまま。条件を変えると、前と後の記録は新しく始まる（種 {seed}）。</p>
        </Sheet>
      )}
    </LabShell>
  );
}
