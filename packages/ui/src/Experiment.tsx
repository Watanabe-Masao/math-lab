// 実験室 v0（stats2-course #102）：予測 → 実験 → 観察 → 理由 → 応用 を、スマホでは1画面に1段ずつ。
// - 実験の定義（ExperimentDef）はデータ。画面は読むだけ（テーマ・使えない場面・次の問いは定義を足すだけで増える）
// - 予想するまで結果を見せない。予想の答えは定義に書かず、理論のモデルから求める
// - 起き方（engine の Mechanism）と理論のモデルを分ける：反例は、成り立つ条件を1つ崩した起き方で、二項の理論とのずれを見る
// - 発見メモは ChatGPT に渡す（公開サイトは個人の記録を持たない。ChatGPT が Notion の学習記録へ書く）
import katex from "katex";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  createRandom, emptySetRecord, expand, modelMoments, modelPmf, runSets, summarize, toTex,
  type Mechanism, type SetRecord,
} from "@math-lab/engine";
import { haptic, reduced, useTween } from "./motion";
import { Sheet } from "./Sheet";
import type { FormulaData } from "./Formula";
import s from "./Experiment.module.css";

type Cond = { n: number; p: number };
type Range = { min: number; max: number; step: number };
export type ExperimentTheme = { id: string; name: string; icon: string; success: string; failure: string; unit?: string; p?: number; story?: string };
export type ExperimentDef = {
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

type Props = {
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
};

const STAGES = ["予測", "実験", "観察", "理由", "応用"] as const;
const DIRS = ["左へ動く", "動かない", "右へ動く"] as const;
const tex = (t: string) => { try { return katex.renderToString(t, { throwOnError: false, output: "html" }); } catch { return t; } };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const r2 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "—" : String(Number(v.toFixed(2))));
const mean = (c: Cond) => modelMoments({ kind: "binom", ...c }).mean;
const peak = (f: number[]) => f.reduce((b, v, i) => (v > f[b]! ? i : b), 0);
const dirOf = (a: Cond, b: Cond) => { const d = mean(b) - mean(a); return Math.abs(d) < 0.25 ? 1 : d > 0 ? 2 : 0; };

/** 棒（実験の割合）・点（理論）・点線（前の条件）を重ねる図。高さは前の値から動く */
function Bars({ freq, theory, ghost, hi, height = 150, label }: { freq?: number[]; theory?: number[]; ghost?: number[]; hi?: number; height?: number; label: string }) {
  const base = freq ?? theory ?? [];
  const n = base.length - 1, W = 340, B = height - 20, R = 30;
  const raw = Math.max(1e-9, ...(freq ?? []), ...(theory ?? []), ...(ghost ?? []));
  const tick = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((t) => raw / t <= 4) ?? 1;
  const top = Math.ceil(raw / tick - 1e-9) * tick;
  const [topT] = useTween([top]);
  const bars = useTween(base);
  const y = (v: number) => B - (v / topT!) * (B - 12);
  const bw = (W - R) / (n + 1), x = (k: number) => k * bw + bw / 2;
  const every = n <= 12 ? 1 : n <= 30 ? 5 : 10;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={s.svg} role="img" aria-label={label}>
      {Array.from({ length: Math.round(top / tick) }, (_, i) => (i + 1) * tick).map((t) => (
        <g key={t}><line x1={0} x2={W - R + 4} y1={y(t)} y2={y(t)} className={s.grid} /><text x={W} y={y(t) + 3.5} textAnchor="end" className={s.tick}>{pct(t)}</text></g>
      ))}
      {ghost && <path d={ghost.map((v, k) => `${k ? "L" : "M"}${x(k)},${y(v)}`).join("")} className={s.ghost} />}
      {bars.map((v, k) => (v > 0 && B - y(v) > 0.3) && (
        <rect key={k} x={x(k) - bw * 0.32} y={y(v)} width={bw * 0.64} height={B - y(v)} rx={Math.min(3, bw * 0.15)} className={k === hi ? s.barHi : freq ? s.bar : s.barTheory} />
      ))}
      {freq && theory?.map((v, k) => <circle key={k} cx={x(k)} cy={y(v)} r={3} className={s.dot} />)}
      <line x1={0} x2={W - R + 4} y1={B} y2={B} className={s.base} />
      {base.map((_, k) => (k % every === 0 || k === hi) && <text key={k} x={x(k)} y={height - 5} textAnchor="middle" className={k === hi ? s.tickOn : s.tick}>{k}</text>)}
    </svg>
  );
}

export function Experiment({ def, reasonFormula, mainFormula, seed: seed0, onConcept, conceptName, onSendMemo, onBack }: Props) {
  const [stage, setStage] = useState(0);
  const [reached, setReached] = useState(0);
  const go = (i: number) => { haptic(); setStage(i); setReached((r) => Math.max(r, i)); top.current?.scrollIntoView?.({ block: "start", behavior: reduced() ? "auto" : "smooth" }); };
  const top = useRef<HTMLDivElement>(null);

  // 問いの組（前の条件 → 変える条件）。応用の段の「次の問い」で入れ替わる
  const [round, setRound] = useState<{ question: string; start: Cond; next: Cond }>(() => ({ question: def.question, start: def.start, next: { ...def.start, ...def.compare } }));
  const [theme, setTheme] = useState(def.themes[0]!);
  const [cond, setCond] = useState<Cond>(round.next);
  const [pred, setPred] = useState<{ dir?: number; peak: number }>({ peak: Math.round(mean(round.start)) });
  const [sheet, setSheet] = useState<"info" | "cond" | null>(null);

  // 実験（種つき。同じ種なら同じ結果）。条件を変えたら記録を分ける
  const [seed, setSeed] = useState(() => seed0 ?? Date.now() % 100000);
  const rng = useRef(createRandom(seed));
  const mech = (c: Cond): Mechanism => ({ kind: "bernoulli", n: c.n, p: c.p });
  const [rec, setRec] = useState<SetRecord>(() => emptySetRecord(seed, mech(cond)));
  const [fresh, setFresh] = useState(0);   // 新しい並びが出た回（並びの動きをやり直す）
  const stream = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (stream.current) { clearInterval(stream.current); stream.current = null; } };
  useEffect(() => stop, []);
  const reset = (c: Cond) => { stop(); const sd = Date.now() % 100000; setSeed(sd); rng.current = createRandom(sd); setRec(emptySetRecord(sd, mech(c))); };
  const changeCond = (c: Cond) => { setCond(c); reset(c); };
  const run = (count: number) => {
    haptic(); stop();
    if (count === 1 || reduced()) { setRec(runSets(rng.current, rec, count)); setFresh((f) => f + 1); return; }   // 更新の関数の中で乱数を進めない（二度呼ばれると種の結果がずれる）
    let cur = rec, done = 0;
    const tick = () => { cur = runSets(rng.current, cur, 10); done += 10; setRec(cur); setFresh((f) => f + 1); if (done >= count) stop(); };
    tick(); stream.current = setInterval(tick, 60);
  };
  const sum = summarize(rec);
  const theoryNow = useMemo(() => modelPmf({ kind: "binom", ...cond }), [cond.n, cond.p]);   // eslint-disable-line react-hooks/exhaustive-deps
  const theoryStart = useMemo(() => modelPmf({ kind: "binom", ...round.start }), [round]);
  const k = rec.last ? rec.last.reduce((a, b) => a + b, 0) : undefined;

  // 反例を実験する：同じ n・p で、成り立つ条件を1つ崩した起き方にして、二項の理論と比べる
  const [bnd, setBnd] = useState<{ id: string; rec: SetRecord } | null>(null);
  const runBoundary = (id: string) => {
    const b = def.counterexamples?.find((x) => x.id === id); if (!b) return;
    const m: Mechanism = b.mechanism.kind === "urn"
      ? { kind: "urn", n: cond.n, total: Math.max(cond.n, b.mechanism.total ?? 40), success: b.mechanism.success ?? Math.round(cond.p * Math.max(cond.n, b.mechanism.total ?? 40)) }
      : b.mechanism.kind === "streak" ? { kind: "streak", n: cond.n, p: cond.p, carry: b.mechanism.carry ?? 0.3 }
      : { kind: "mix", n: cond.n, p: cond.p, spread: b.mechanism.spread ?? 0.2 };
    haptic();
    const sd = Date.now() % 100000;
    setBnd({ id, rec: runSets(createRandom(sd), emptySetRecord(sd, m), 1000) });
  };

  // 発見メモ → ChatGPT
  const [memo, setMemo] = useState("");
  const actual = dirOf(round.start, round.next);
  const memoText = () => [
    "【学習記録】実験室", `実験：${def.title}（${def.id}）`, `問い：${round.question}`, `テーマ：${theme.name}`,
    `条件：n＝${round.start.n}・p＝${round.start.p} → n＝${cond.n}・p＝${cond.p}`,
    `予想：${pred.dir !== undefined ? DIRS[pred.dir] : "—"}（山の頂点 k＝${pred.peak}）`,
    `結果：${rec.sets} セット・平均 ${r2(sum.mean)}（理論 ${r2(mean(cond))}）・種 ${seed}`,
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
        <Bars theory={theoryStart} hi={peak(theoryStart)} height={130} label="前の条件の理論の分布" />
      </section>
      <section className={s.card}>
        <p className={s.h}>{`${round.next.p !== round.start.p ? `p＝${pct(round.next.p)}` : `n＝${round.next.n}`} にすると、山は…`}</p>
        <div className={s.choice} role="radiogroup" aria-label="予想">
          {DIRS.map((d, i) => <button key={d} type="button" role="radio" aria-checked={pred.dir === i} onClick={() => { haptic(); setPred((p) => ({ ...p, dir: i })); }}>{d}</button>)}
        </div>
        <label className={s.peak}>
          <span>山のいちばん高い所は？</span><b>k＝{pred.peak}</b>
          <input type="range" min={0} max={round.next.n} step={1} value={pred.peak} onChange={(e) => setPred((p) => ({ ...p, peak: Number(e.target.value) }))}
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
        <div className={s.set} key={fresh} data-testid="exp-set">
          {(rec.last ?? Array(cond.n).fill(null)).map((v, i) => (
            <span key={i} className={v === null ? s.slot : v ? s.hit : s.miss} style={{ "--i": i } as CSSProperties} title={v === null ? "" : v ? theme.success : theme.failure}>
              {v === null ? "" : v ? theme.icon : "・"}
            </span>
          ))}
        </div>
        <p className={s.big} aria-live="polite">{k === undefined ? <span className={s.muted}>「1セット」を押すと {cond.n} {theme.unit ?? "回"}起こる</span> : <>{cond.n} {theme.unit ?? "回"}中 <em>{k}</em> {theme.unit ?? "回"} {theme.success}</>}</p>
      </section>
      <section className={s.card}>
        <p className={s.h}>{`${theme.success}の数ごとのセット数`}<span data-testid="exp-sets">{rec.sets} セット</span></p>
        <Bars freq={sum.freq} hi={k} label="実験の結果の割合" />
      </section>
      <div className={s.conds}><span className={s.chip}>n＝{cond.n}</span><span className={`${s.chip} ${s.on}`}>p＝{r2(cond.p)}</span><button type="button" className={s.chip} onClick={() => setSheet("cond")}>条件を変える ▾</button></div>
    </>;
    cta = <>
      <div className={s.two}>
        <button type="button" className={s.secondary} onClick={() => run(1)} data-testid="exp-run-1">1セット</button>
        <button type="button" className={s.primary} onClick={() => run(100)} data-testid="exp-run-100">▶ 100セット</button>
      </div>
      <button type="button" className={s.next} disabled={rec.sets < 20} onClick={() => go(2)}>{rec.sets < 20 ? `あと ${20 - rec.sets} セットで観察できる` : "観察する →"}</button>
    </>;
  } else if (stage === 2) {
    const ok = pred.dir === actual, pk = peak(theoryNow);
    body = <>
      <div className={ok ? s.ok : s.ng} data-testid="exp-verdict">
        <b>{ok ? "✓ 予想どおり" : "✗ 予想と違った"}</b>　山は{DIRS[actual]}（いちばん高いのは k＝{pk}。予想は k＝{pred.peak}）
      </div>
      <section className={s.card}>
        <div className={s.legend}><span><i className={s.kBar} />実験 {rec.sets} セット</span><span><i className={s.kDot} />理論</span><span><i className={s.kGhost} />前の条件</span></div>
        <Bars freq={sum.freq} theory={theoryNow} ghost={theoryStart} hi={pk} height={170} label="実験と理論と前の条件" />
      </section>
      <div className={s.tiles}>
        <div>平均（実験）<b>{r2(sum.mean)}</b><i>前の条件では {r2(mean(round.start))}</i></div>
        <div>平均（理論）<b>{r2(mean(cond))}</b><i>n×p＝{cond.n}×{r2(cond.p)}</i></div>
      </div>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ {r2(mean(cond))} になる？ 理由を考える</button>;
  } else if (stage === 3) {
    body = <>
      <section className={s.card}>
        <p className={s.h}>{def.reason?.title ?? "式で確かめる"}</p>
        {reasonTex && <div className={s.math} dangerouslySetInnerHTML={{ __html: tex(reasonTex) }} />}
      </section>
      {def.reason?.steps.length ? (
        <section className={s.card}>
          <p className={s.h}>なぜそうなる？</p>
          <ol className={s.steps}>{def.reason.steps.map((t) => <li key={t}>{t}</li>)}</ol>
        </section>
      ) : null}
      {def.reason?.concept && onConcept && (
        <button type="button" className={s.cardLink} onClick={() => onConcept(def.reason!.concept!)}>
          <b>式を動かして確かめる</b><span>{name(def.reason.concept)} の作業台：かたまりを押すと意味と値、p を動かすと山が動く</span>
        </button>
      )}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>別の条件で試す</button>;
  } else {
    const b = bnd && def.counterexamples?.find((x) => x.id === bnd.id);
    body = <>
      {def.next?.length ? (
        <section className={s.card}>
          <p className={s.h}>次の問い</p>
          {def.next.map((nx) => (
            <button key={nx.question} type="button" className={s.rowBtn} onClick={() => {
              const st = { ...cond }, nt = { ...cond, ...nx.set };
              setRound({ question: nx.question, start: st, next: nt }); setPred({ peak: Math.round(mean(st)) }); setBnd(null); go(0);
            }}>{nx.question}</button>
          ))}
        </section>
      ) : null}
      {def.counterexamples?.length ? (
        <section className={s.card}>
          <p className={s.h}>反例を実験する<span>成り立つ条件を1つ崩す</span></p>
          <div className={s.chips}>{def.counterexamples.map((x) => <button key={x.id} type="button" className={`${s.chip}${bnd?.id === x.id ? ` ${s.on}` : ""}`} onClick={() => runBoundary(x.id)} data-testid={`exp-bnd-${x.id}`}>{x.name}</button>)}</div>
          {b && bnd && <>
            <Bars freq={summarize(bnd.rec).freq} theory={theoryNow} height={130} label={`${b.name}の実験と二項分布の理論`} />
            <p className={s.breaks}>崩した条件：{b.breaks}</p>
            <p className={s.note}>{b.text}</p>
            <div className={s.tiles}>
              <div>散らばり（実験）<b>{r2(summarize(bnd.rec).variance)}</b><i>1000 セット</i></div>
              <div>二項分布なら<b>{r2(modelMoments({ kind: "binom", ...cond }).variance)}</b><i>np(1−p)</i></div>
            </div>
            {b.concept && onConcept && <button type="button" className={s.link} onClick={() => onConcept(b.concept!)}>{name(b.concept)} を見る</button>}
          </>}
        </section>
      ) : null}
      <section className={s.card}>
        <p className={s.h}>発見メモ<span>ChatGPT に渡して学習記録へ</span></p>
        <textarea className={s.memo} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="気づいたこと・考えたこと（例：p を上げると山は右へ。中心は n×p）" aria-label="発見メモ" />
      </section>
      {def.links.concepts?.length ? <section className={s.card}><p className={s.h}>つながる概念</p>{chips(def.links.concepts)}</section> : null}
    </>;
    cta = <button type="button" className={s.primary} onClick={send} data-testid="exp-send">メモを ChatGPT に送る</button>;
  }

  return (
    <div className={s.root} data-testid="experiment">
      <div ref={top} className={s.top}>
        <div className={s.titleRow}>{onBack && <button type="button" className={s.info} onClick={onBack} aria-label="戻る">←</button>}<b>{def.title}</b><button type="button" className={s.info} onClick={() => setSheet("info")} aria-label="基本と用語">ⓘ</button></div>
        <ol className={s.stepper} aria-label="段">
          {STAGES.map((t, i) => (
            <li key={t}><button type="button" disabled={i > reached} aria-current={i === stage ? "step" : undefined} className={i < stage || (i <= reached && i !== stage) ? s.done : undefined} onClick={() => go(i)}>
              <i>{i < stage ? "✓" : i + 1}</i>{t}</button></li>
          ))}
        </ol>
        <p className={s.q} data-testid="exp-question"><span>今回の問い</span>{round.question}</p>
      </div>
      <div className={s.body} key={stage}>{body}</div>
      <div className={s.bar}>{cta}</div>
      {sheet === "info" && (
        <Sheet label="基本と用語" title={def.title.replace(/ ?実験室$/, "の基本")} onClose={() => setSheet(null)} data-testid="exp-info">
          {mainFormula?.tex && <div className={s.math} dangerouslySetInnerHTML={{ __html: tex(mainFormula.tex) }} />}
          {mainFormula?.symbols?.length ? <dl className={s.kv}>{mainFormula.symbols.filter((x) => x.kind).map((x) => <div key={x.key}><dt>{x.symbol}</dt><dd>{x.meaning}</dd></div>)}</dl> : null}
          {def.points?.length ? <><p className={s.h}>ポイント</p><ul className={s.points}>{def.points.map((t) => <li key={t}>{t}</li>)}</ul></> : null}
          {def.links.concepts?.length ? <><p className={s.h}>関連する概念</p>{chips(def.links.concepts)}</> : null}
        </Sheet>
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
          <p className={s.muted}>条件を変えると、記録は新しく始まる（種 {seed}）。</p>
        </Sheet>
      )}
    </div>
  );
}
