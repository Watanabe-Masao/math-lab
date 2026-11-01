// 実験室の入口と問いの形（stats2-course issue 161）。
// - 入口「何を確かめたい？」：最初の問い（位置）・問い（questions）・前提崩し（反例）を1つの一覧に並べる
// - 問いの形ごとに「予測の部品」と「観察の部品」を1組ずつ持つ。流れ（予測 → 実験 → 観察 → 理由 → 応用）は同じ
// - prob（確率の値）：事象（ちょうど k 回・k 回以上・k 回以下）の確率を目盛りで予想し、範囲に入ったセットの割合と理論を照らす。
//   答えは定義に書かず、二項分布の理論から求める。目盛りの境目の近くに答えがある問いは教材の build が止める
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { modelPmf, summarize } from "@math-lab/engine";
import { haptic } from "./motion";
import { Bars, LabShell, pct, useRuns, useStages } from "./labParts";
import type { BinomDef, ExperimentTheme } from "./Experiment";
import s from "./Experiment.module.css";

export type ProbQuestion = NonNullable<BinomDef["questions"]>[number];
type Ev = ProbQuestion["events"][number];
type Cond = { n: number; p: number };

/** 問いの形の名前（入口の一覧の札） */
export const FORM_NAMES = { shift: "位置", prob: "確率の値", break: "前提崩し" } as const;
export type MenuItem = { id: string; form: keyof typeof FORM_NAMES; title: string; sub?: string };

/** 入口：何を確かめたい？ */
export function QuestionMenu({ title, items, onPick, onBack, onInfo, children }: {
  title: string; items: MenuItem[]; onPick: (id: string) => void; onBack?: () => void; onInfo?: () => void; children?: ReactNode;
}) {
  return (
    <LabShell title={title} question="何を確かめたい？" qLabel="問いを選ぶ" stepper={false} stage={0} reached={0} go={() => {}} onBack={onBack} onInfo={onInfo}
      body={<div className={s.menu} data-testid="exp-menu">
        {items.map((it) => (
          <button key={it.id} type="button" className={s.menuItem} onClick={() => { haptic(); onPick(it.id); }} data-testid={`exp-q-${it.id}`}>
            <span className={s.form}>{FORM_NAMES[it.form]}</span>
            <b>{it.title}</b>
            {it.sub && <small>{it.sub}</small>}
          </button>
        ))}
      </div>}
      cta={null}>{children}</LabShell>
  );
}

/** 事象の言葉（「9 回以上」）と、k がその事象に入るか */
export const evText = (e: Ev, unit = "回") => (e.op === "eq" ? `ちょうど ${e.k} ${unit}` : e.op === "ge" ? `${e.k} ${unit}以上` : `${e.k} ${unit}以下`);
const inEv = (e: Ev) => (k: number) => (e.op === "eq" ? k === e.k : e.op === "ge" ? k >= e.k : k <= e.k);
const probOf = (pmf: number[], e: Ev) => pmf.reduce((t, v, k) => t + (inEv(e)(k) ? v : 0), 0);
const pct2 = (v: number) => `${Number((v * 100).toFixed(2))}%`;

/** 目盛り（大きい順の境目）から予想の選び肢を作る。答えは理論の確率が入る区間 */
export function scaleChoices(scale: number[]) {
  const labels = scale.map((b, i) => (i === 0 ? `${pct(b)}以上` : `${pct(b)}〜${pct(scale[i - 1]!)}`));
  return { labels: [...labels, `${pct(scale[scale.length - 1]!)}未満`], of: (v: number) => { const i = scale.findIndex((b) => v >= b); return i < 0 ? scale.length : i; } };
}

const STAGES_PROB = ["予測", "実験", "観察", "理由", "応用"] as const;

type ProbProps = {
  def: BinomDef; q: ProbQuestion; seed?: number; onBack?: () => void; onMenu: () => void; onInfo?: () => void;
  /** 理由の段に置く作業台（今の条件と事象の k で始める） */
  reason?: (c: Cond, k: number) => ReactNode;
  children?: ReactNode;
};

/** 確率の値の問い。応用で条件を変えたら、同じ形の問いを予想から作り直す（段・記録・予想を新しくする） */
export function ProbLab(props: ProbProps) {
  const [cur, setCur] = useState({ q: props.q, n: 0 });
  return <ProbRun key={cur.n} {...props} q={cur.q} onNew={(q) => setCur((c) => ({ q, n: c.n + 1 }))} />;
}

function ProbRun({ def, q, seed: seed0, onBack, onMenu, onInfo, reason, children, onNew }: ProbProps & { onNew: (q: ProbQuestion) => void }) {
  const { stage, reached, go } = useStages(0);
  const cond: Cond = q.set, events = q.events, question = q.question;
  const [theme, setTheme] = useState<ExperimentTheme>(def.themes[0]!);
  const scale = useMemo(() => scaleChoices(def.prob_scale ?? [0.5, 0.2, 0.05, 0.01]), [def.prob_scale]);
  const [guess, setGuess] = useState<(number | undefined)[]>(() => events.map(() => undefined));
  const [focus, setFocus] = useState(0);
  const pmf = useMemo(() => modelPmf({ kind: "binom", ...cond }), [cond.n, cond.p]);   // eslint-disable-line react-hooks/exhaustive-deps
  const theory = events.map((e) => probOf(pmf, e));
  const answer = theory.map((v) => scale.of(v));
  const { rec, run, seed } = useRuns({ kind: "bernoulli", n: cond.n, p: cond.p }, seed0);
  const sum = summarize(rec);
  const hits = events.map((e) => rec.ks.filter(inEv(e)).length);
  const k = rec.last ? rec.last.reduce((a, b) => a + b, 0) : undefined;
  const unit = theme.unit ?? "回";
  const ev = events[focus] ?? events[0]!;
  // 応用：条件を変えて同じ形の問いを自分で作る（予想から）
  const [draft, setDraft] = useState<{ n: number; p: number; k: number }>({ ...cond, k: events[0]!.k });

  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      <section className={s.card}>
        <p className={s.h}>{`n＝${cond.n}・p＝${pct(cond.p)}`}<span>1セット＝{cond.n} 回</span></p>
        <p className={s.story}>成功確率 {pct(cond.p)} の試行を {cond.n} 回くり返して、成功の回数を数える。これを1セットとして何度も起こす。</p>
      </section>
      {events.map((e, i) => (
        <section key={i} className={s.card}>
          <p className={s.h}>{`成功が ${evText(e)} になる確率は？`}</p>
          <div className={s.scale} role="radiogroup" aria-label={`${evText(e)} の確率の予想`}>
            {scale.labels.map((t, j) => <button key={t} type="button" role="radio" aria-checked={guess[i] === j} onClick={() => { haptic(); setGuess(guess.map((g, x) => (x === i ? j : g))); }}>{t}</button>)}
          </div>
        </section>
      ))}
    </>;
    const ready = guess.every((g) => g !== undefined);
    cta = <button type="button" className={s.primary} disabled={!ready} onClick={() => go(1)}>{ready ? "この予想で実験する" : "まず予想を選ぶ"}</button>;
  } else if (stage === 1) {
    body = <>
      <div className={s.themes} role="radiogroup" aria-label="題材">
        {def.themes.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === theme.id} onClick={() => { haptic(); setTheme(t); }}><span aria-hidden="true">{t.icon}</span>{t.name}</button>)}
      </div>
      <section className={s.card}>
        <p className={s.h}>いまの1セット<span>{theme.icon}＝{theme.success}</span></p>
        <div className={s.set} data-testid="exp-set">
          {(rec.last ?? Array(cond.n).fill(null)).map((v, i) => (
            <span key={`${rec.sets}-${i}`} className={v === null ? s.slot : v ? s.hit : s.miss} style={{ "--i": i } as CSSProperties}>{v === null ? "" : v ? theme.icon : "・"}</span>
          ))}
        </div>
        {k !== undefined && <p className={s.laneHead}><b>{theme.success} <em>{k}</em> {unit}（{cond.n} {unit}中）</b>{events.map((e, i) => <span key={i} className={inEv(e)(k) ? s.evIn : s.muted}>{inEv(e)(k) ? "✓ " : ""}{evText(e, unit)}</span>)}</p>}
      </section>
      <section className={s.card}>
        <p className={s.h}>当てはまったセット<span data-testid="exp-sets">{rec.sets} セット</span></p>
        <div className={s.tiles}>
          {events.map((e, i) => <div key={i} data-testid={`exp-hit-${i}`}>{evText(e, unit)}<b>{hits[i]}<small> ／ {rec.sets}</small></b><i>{rec.sets ? pct2(hits[i]! / rec.sets) : "—"}</i></div>)}
        </div>
        {events.length > 1 && <div className={s.chips} role="radiogroup" aria-label="図で塗る事象">{events.map((e, i) => <button key={i} type="button" role="radio" aria-checked={focus === i} className={`${s.chip}${focus === i ? ` ${s.on}` : ""}`} onClick={() => setFocus(i)}>{evText(e, unit)}を塗る</button>)}</div>}
        <Bars freq={sum.freq} hiIn={inEv(ev)} label={`成功の回数ごとのセットの割合（${evText(ev, unit)}を塗る）`} />
      </section>
    </>;
    cta = <>
      <div className={s.two}>
        <button type="button" className={s.secondary} onClick={() => run(1)} data-testid="exp-run-1">1セット</button>
        <button type="button" className={s.primary} onClick={() => run(100)} data-testid="exp-run-100">▶ 100セット</button>
      </div>
      <button type="button" className={s.next} disabled={rec.sets < 100} onClick={() => go(2)}>{rec.sets < 100 ? `あと ${100 - rec.sets} セットで観察できる` : "観察する →"}</button>
    </>;
  } else if (stage === 2) {
    body = <>
      {events.map((e, i) => {
        const ok = guess[i] === answer[i], obs = hits[i]! / Math.max(1, rec.sets), band = 2 * Math.sqrt((theory[i]! * (1 - theory[i]!)) / Math.max(1, rec.sets));
        return (
          <div key={i} className={ok ? s.ok : s.ng} data-testid={`exp-verdict-${i}`}>
            <b>{ok ? "✓ 予想どおり" : "✗ 予想と違った"}</b>　{evText(e, unit)}の確率は <b>{pct2(theory[i]!)}</b>（{scale.labels[answer[i]!]}。予想は {scale.labels[guess[i]!]}）
            <span className={s.shape}>実験では {rec.sets} セット中 {hits[i]} セット（{pct2(obs)}）。この回数では理論のまわりで ±{pct2(band)} ほどゆれる</span>
          </div>
        );
      })}
      {events.length === 2 && events[0]!.op === "eq" && events[1]!.op === "ge" && events[0]!.k === events[1]!.k && (
        <p className={s.note} data-testid="exp-compare-note">{evText(events[1]!, unit)}には、ちょうど {events[0]!.k} {unit}も入る。{evText(events[1]!, unit)}の確率は、ちょうど {events[0]!.k}・{events[0]!.k + 1}・…・{cond.n} {unit}の棒を全部足したもの（ちょうど {events[0]!.k} {unit}はその {pct(theory[0]! / Math.max(1e-12, theory[1]!))}）。</p>
      )}
      <section className={s.card}>
        {events.length > 1 && <div className={s.chips} role="radiogroup" aria-label="図で塗る事象">{events.map((e, i) => <button key={i} type="button" role="radio" aria-checked={focus === i} className={`${s.chip}${focus === i ? ` ${s.on}` : ""}`} onClick={() => setFocus(i)}>{evText(e, unit)}を塗る</button>)}</div>}
        <div className={s.legend}><span><i className={s.kBar} />実験</span><span><i className={s.kDot} />理論</span></div>
        <Bars freq={sum.freq} theory={pmf} hiIn={inEv(ev)} height={160} label={`実験の割合と理論の確率（${evText(ev, unit)}を塗る）`} />
      </section>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ {pct2(theory[focus]!)} になる？ 理由を考える</button>;
  } else if (stage === 3) {
    const ks = Array.from({ length: cond.n + 1 }, (_, j) => j).filter(inEv(ev));
    body = <>
      <section className={s.card}>
        <p className={s.h}>{`棒を足す：${evText(ev, unit)}`}<span>{ks.length} 本</span></p>
        <table className={s.cmpTable} data-testid="exp-sum">
          <thead><tr><th scope="col">成功の回数</th><th scope="col">確率 P(X＝k)</th></tr></thead>
          <tbody>
            {ks.map((j) => <tr key={j}><td>k＝{j}</td><td>{pct2(pmf[j]!)}</td></tr>)}
            <tr><td><b>合計</b></td><td><b data-testid="exp-sum-total">{pct2(theory[focus]!)}</b></td></tr>
          </tbody>
        </table>
        <p className={s.note}>{ev.op === "eq" ? "ちょうど k 回は棒1本。" : "k 回以上・以下は、当てはまる棒を全部足す。"}1本の棒は二項分布の式 P(X＝k)＝ₙCₖ pᵏ(1−p)ⁿ⁻ᵏ で求まる。</p>
      </section>
      {reason && <section className={s.ws} data-testid="exp-workspace">
        <p className={s.h}>式を動かして確かめる<span>k を動かすと棒1本の確率</span></p>
        {reason(cond, ks[0] ?? 0)}
      </section>}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>別の条件で試す</button>;
  } else {
    const dp = probOf(modelPmf({ kind: "binom", n: draft.n, p: draft.p }), { op: events[0]!.op, k: Math.min(draft.k, draft.n) });
    body = <>
      <section className={s.card}>
        <p className={s.h}>条件を変えて同じ問い<span>{evText({ op: events[0]!.op, k: Math.min(draft.k, draft.n) })}</span></p>
        {([["n", "回数 n", def.vary.n.min, def.vary.n.max, 1], ["p", "成功確率 p", def.vary.p.min, def.vary.p.max, def.vary.p.step], ["k", "k", 0, draft.n, 1]] as const).map(([key, label, mn, mx, st]) => (
          <label key={key} className={s.peak}>
            <span>{label}</span><b>{key === "p" ? pct(draft.p) : draft[key]}</b>
            <input type="range" min={mn} max={mx} step={st} value={Math.min(draft[key], mx)} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
              style={{ "--fill": `${((Math.min(draft[key], mx) - mn) / Math.max(1e-9, mx - mn)) * 100}%` } as CSSProperties} aria-label={`応用の ${key}`} data-testid={`exp-app-${key}`} />
          </label>
        ))}
        <p className={s.muted}>予想してから確かめるので、確率はまだ出さない（{scale.labels.length} 段の目盛りで予想する）。{dp === 0 || dp === 1 ? "この条件では必ず起きないか必ず起きる。" : ""}</p>
      </section>
    </>;
    cta = <>
      <button type="button" className={s.primary} data-testid="exp-app-go" onClick={() => {
        const e: Ev = { op: events[0]!.op, k: Math.min(draft.k, draft.n) };
        onNew({ ...q, id: `${q.id}-own`, set: { n: draft.n, p: draft.p }, events: [e], question: `成功確率 ${pct(draft.p)} で、${draft.n} 回中 ${evText(e)}になる確率は？` });
      }}>この条件で予想から</button>
      <button type="button" className={s.next} onClick={onMenu} data-testid="exp-to-menu">別の問いへ</button>
    </>;
  }
  return (
    <LabShell title={def.title} question={question} stage={stage} reached={reached} go={go} onBack={onBack} onInfo={onInfo} stages={STAGES_PROB} body={body} cta={cta}>
      {children}
      <span hidden data-testid="exp-seed">{seed}</span>
    </LabShell>
  );
}

