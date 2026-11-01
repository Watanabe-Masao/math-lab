// 実験室の問い（stats2-course issue 161。試作「二項分布の問いの試作」版2 の形）。
// - 入口「何を確かめたい？」：問い（位置・広がり・確率の値・理論と実測・前提崩し）と「自分で条件を決めて比べる」を並べる
// - どの問いも 予測 → 実験 → 観察 → 理由 → 応用 の5段。観察は、数の比べ表・分布の比べ・移り変わりの図を同じ部品で出す
// - 予想の答えは定義に書かず、理論（engine の modelPmf・mechanismMoments）から求める
// - 応用は下の操作の帯で条件を動かす。最後に「この条件をカードに残す」と発見メモ
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { mechanismMoments, modelPmf, runningMean, runningSd, runningShare, summarize, type CardMechanism, type Mechanism } from "@math-lab/engine";
import { haptic } from "./motion";
import { LabShell, peak, useRuns, usePairRuns, useStages } from "./labParts";
import { CompareRows, CompareTable, DistRows, Dock, Field, PairRows, RunChart, ScaleChoice, Seg, TheoryRows, fmtN, oneIn, pc, pctSig, pShort, qs, r2, scaleChoices, type CmpRow } from "./QuestionParts";
import type { BinomDef, ExperimentTheme } from "./Experiment";
import s from "./Experiment.module.css";

type Cond = { n: number; p: number };
type Op = "eq" | "ge" | "le";
type Ev = { op: Op; k: number };
export type BinomQuestion = NonNullable<BinomDef["questions"]>[number];
export const STAGES_Q = ["予測", "実験", "観察", "理由", "応用"] as const;
export const FORM_NAMES = { shift: "位置", spread: "広がり", prob: "確率の値", conv: "理論と実測", break: "前提崩し", compare: "比べる" } as const;
export type MenuItem = { id: string; form: keyof typeof FORM_NAMES; title: string; sub?: string };
const SPREAD3 = ["広くなる", "変わらない", "狭くなる"] as const;
const pmfOf = (c: Cond) => modelPmf({ kind: "binom", ...c });
const meanOf = (f: number[]) => f.reduce((t, v, k) => t + k * v, 0);
const sdOf = (f: number[]) => { const m = meanOf(f); return Math.sqrt(f.reduce((t, v, k) => t + (k - m) ** 2 * v, 0)); };
export const evText = (e: Ev, unit = "回") => (e.op === "eq" ? `ちょうど ${e.k} ${unit}` : e.op === "ge" ? `${e.k} ${unit}以上` : `${e.k} ${unit}以下`);
const inEv = (e: Ev) => (k: number) => (e.op === "eq" ? k === e.k : e.op === "ge" ? k >= e.k : k <= e.k);
const probOf = (f: number[], e: Ev) => f.reduce((t, v, k) => t + (inEv(e)(k) ? v : 0), 0);
const sumK = (ks: number[]) => ks.reduce((a, b) => a + b, 0);

/** 入口：何を確かめたい？ */
export function QuestionMenu({ title, items, onPick, onBack, onInfo, children }: { title: string; items: MenuItem[]; onPick: (id: string) => void; onBack?: () => void; onInfo?: () => void; children?: ReactNode }) {
  return (
    <LabShell title={title} question="何を確かめたい？" qLabel="問いを選ぶ" stepper={false} stage={0} reached={0} go={() => {}} onBack={onBack} onInfo={onInfo}
      body={<div className={s.menu} data-testid="exp-menu">
        {items.map((it) => (
          <button key={it.id} type="button" className={s.menuItem} onClick={() => { haptic(); onPick(it.id); }} data-testid={`exp-q-${it.id}`}>
            <span className={s.form}>{FORM_NAMES[it.form]}</span><b>{it.title}</b>{it.sub && <small>{it.sub}</small>}
          </button>
        ))}
      </div>}
      cta={null}>{children}</LabShell>
  );
}

// ---------------- 共通の部品 ----------------
export type QProps = {
  def: BinomDef; seed?: number; onBack?: () => void; onMenu: () => void; onInfo?: () => void;
  /** 応用で「この条件をカードに残す」 */
  onKeep: (m: CardMechanism, from: string) => void;
  /** 発見メモを送る */
  onMemo: (text: string) => void;
  /** 理由の段に置く作業台（二項分布の式。今の条件と k で始める） */
  workspace?: (c: Cond, k: number) => ReactNode;
  /** 概念へのリンク（反例の概念など） */
  conceptLink?: (id: string) => ReactNode;
  children?: ReactNode;
};
function Themes({ def, theme, setTheme }: { def: BinomDef; theme: ExperimentTheme; setTheme: (t: ExperimentTheme) => void }) {
  return <div className={s.themes} role="radiogroup" aria-label="題材">
    {def.themes.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === theme.id} onClick={() => { haptic(); setTheme(t); }}><span aria-hidden="true">{t.icon}</span>{t.name}</button>)}
  </div>;
}
function Lane({ tag, last, n, theme, testid, cls }: { tag: string; last: number[] | null; n: number; theme: ExperimentTheme; testid: string; cls?: string }) {
  const k = last ? sumK(last) : undefined, unit = theme.unit ?? "回";
  return <div className={`${s.lane} ${cls ?? ""}`}>
    <div className={s.laneHead}><b>{tag}</b>{k === undefined ? <span className={s.muted}>まだ</span> : <span>{theme.success} <em>{k}</em> {unit}（{n} {unit}中）</span>}</div>
    <div className={s.set} data-testid={testid}>
      {(last ?? Array(n).fill(null)).map((v, i) => <span key={i} className={v === null ? s.slot : v ? s.hit : s.miss} style={{ "--i": i } as CSSProperties}>{v === null ? "" : v ? theme.icon : "・"}</span>)}
    </div>
  </div>;
}
function RunButtons({ run, sets, need, go, big = 1000 }: { run: (c: number, per?: number) => void; sets: number; need: number; go: () => void; big?: number }) {
  return <>
    <div className={s.two} style={{ gridTemplateColumns: "1fr 1fr 1.3fr" }}>
      <button type="button" className={s.secondary} onClick={() => run(1)} data-testid="exp-run-1">1セット</button>
      <button type="button" className={s.secondary} onClick={() => run(100, 20)} data-testid="exp-run-100">100</button>
      <button type="button" className={s.primary} onClick={() => run(big, 50)} data-testid="exp-run-big">▶ {big.toLocaleString()}</button>
    </div>
    <button type="button" className={s.next} disabled={sets < need} onClick={go} data-testid="exp-to-observe">{sets < need ? `あと ${need - sets} セットで観察できる` : "観察する →"}</button>
  </>;
}
function Verdict({ ok, edge, head, big, children, testid = "exp-verdict" }: { ok: boolean; edge?: boolean; head?: string; big?: string; children: ReactNode; testid?: string }) {
  return <div className={ok ? s.ok : s.ng} data-testid={testid} data-ok={String(ok)}>
    <b>{edge ? "△ ほぼ境目" : ok ? "✓ 予想どおり" : "✗ 予想と違った"}{head ? `　${head}` : ""}</b>
    {big && <span className={s.bigNum}>{big}</span>}
    <span className={s.shape} style={{ display: "block" }}>{children}</span>
  </div>;
}
function Card({ title, sub, children, testid }: { title: string; sub?: string; children: ReactNode; testid?: string }) {
  return <section className={s.card} data-testid={testid}><p className={s.h}>{title}{sub && <span>{sub}</span>}</p>{children}</section>;
}
/** 応用の最後：この条件をカードに残す・発見メモ */
function AppExtra({ m, from, onKeep, onMemo, desc }: { m: CardMechanism; from: string; onKeep: QProps["onKeep"]; onMemo: QProps["onMemo"]; desc: string }) {
  const [memo, setMemo] = useState(""), [kept, setKept] = useState(false);
  return <>
    <Card title="記録して比べる">
      <p className={qs.muted}>今の条件（{desc}）で 100 セット起こしてカードに残す。カードは入口の「自分で条件を決めて比べる」で重ねて見る。</p>
      <button type="button" className={s.secondary} onClick={() => { haptic(); onKeep(m, from); setKept(true); }} data-testid="exp-keep">この条件をカードに残す</button>
      {kept && <p className={qs.muted} role="status">カードに残した。入口の「自分で条件を決めて比べる」で見る</p>}
    </Card>
    <Card title="発見メモ" sub="ChatGPT に渡して学習記録へ">
      <textarea className={s.memo} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="気づいたこと・考えたこと" aria-label="発見メモ" />
      <button type="button" className={s.secondary} onClick={() => onMemo([`【学習記録】実験室`, `問い：${from}`, `条件：${desc}`, `メモ：${memo || "—"}`, `日時：${new Date().toISOString()}`, "→ この内容を Notion の学習記録（学習ログ）に記録してください。"].join("\n"))} data-testid="exp-send">メモを ChatGPT に送る</button>
    </Card>
  </>;
}
const descOf = (m: CardMechanism) => (m.kind === "bernoulli" ? `n＝${m.n}・p＝${pc(m.p)}` : "");

// ---------------- 位置：成功確率を変えると分布はどう動く？ ----------------
export function ShiftQ(props: QProps) {
  const { def } = props;
  const { stage, reached, go } = useStages(0);
  const start: Cond = def.start, next: Cond = { ...def.start, ...def.compare };
  const [theme, setTheme] = useState(def.themes[0]!);
  const f0 = useMemo(() => pmfOf(start), []), f1 = useMemo(() => pmfOf(next), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const k0 = peak(f0), k1 = peak(f1);
  const [guess, setGuess] = useState<number | null>(null);
  const { before: A, after: B, run } = usePairRuns({ kind: "bernoulli", ...start }, { kind: "bernoulli", ...next }, props.seed);
  const dir = (k: number) => (k > k0 ? 2 : k < k0 ? 0 : 1);
  const [app, setApp] = useState<Cond>(next), [sel, setSel] = useState("p");
  const unit = theme.unit ?? "回";
  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      <Card title="いまの山" sub={`n＝${start.n}・p＝${pc(start.p)}`}><TheoryRows pmf={f0} inEvent={(k) => k === k0} /><p className={qs.muted}>いちばん高いのは {k0} 回（色の行）。</p></Card>
      <Card title={`p を ${pc(next.p)} にすると、いちばん高い所は？`}>
        <div className={s.kStep}>
          <button type="button" aria-label="減らす" disabled={guess === 0} onClick={() => setGuess(Math.max(0, (guess ?? k0) - 1))}>−</button>
          <b data-testid="exp-guess-peak">{guess === null ? "選ぶ" : `${guess} 回`}</b>
          <button type="button" aria-label="増やす" disabled={guess === next.n} onClick={() => setGuess(Math.min(next.n, (guess ?? k0) + 1))}>＋</button>
        </div>
        <p className={qs.muted}>{guess === null ? "−／＋ で頂点を選ぶ" : ["山は左へ動くと予想", "山は動かないと予想", "山は右へ動くと予想"][dir(guess)]}</p>
      </Card>
    </>;
    cta = <button type="button" className={s.primary} disabled={guess === null} onClick={() => go(1)}>{guess === null ? "まず予想を選ぶ" : "この予想で実験する"}</button>;
  } else if (stage === 1) {
    body = <>
      <Themes def={def} theme={theme} setTheme={setTheme} />
      <Card title="いまの1セット" sub="前と後で同じ回数ずつ"><div className={s.lanes}><Lane tag={`前：p＝${pc(start.p)}`} last={A.last} n={start.n} theme={theme} testid="exp-set-before" cls={s.laneB} /><Lane tag={`後：p＝${pc(next.p)}`} last={B.last} n={next.n} theme={theme} testid="exp-set" cls={s.laneA} /></div></Card>
      <Card title={`${theme.success}の数ごとの割合`} sub={`各 ${A.sets.toLocaleString()} セット`} testid="exp-sets-card">
        <PairRows labels={f0.map((_, k) => `${k} ${unit}`)} a={summarize(A).freq} b={summarize(B).freq} names={[`前 ${pc(start.p)}`, `後 ${pc(next.p)}`]} />
      </Card>
    </>;
    cta = <RunButtons run={run} sets={A.sets} need={100} go={() => go(2)} />;
  } else if (stage === 2) {
    const ok = guess !== null && dir(guess) === dir(k1), N = B.sets;
    const rows: CmpRow[] = [
      { label: "平均（前）", exp: summarize(A).mean, th: meanOf(f0), se: (2 * sdOf(f0)) / Math.sqrt(A.sets) },
      { label: "平均（後）", exp: summarize(B).mean, th: meanOf(f1), se: (2 * sdOf(f1)) / Math.sqrt(N) },
      { label: "頂点（後）", exp: peak(summarize(B).freq), th: k1, fmt: (v) => `${v} 回` },
      { label: "散らばり（後）", exp: Math.sqrt(summarize(B).variance ?? NaN), th: sdOf(f1), se: (2 * sdOf(f1)) / Math.sqrt(2 * N) },
    ];
    body = <>
      <Verdict ok={ok}>山は{["左へ動く", "動かない", "右へ動く"][dir(k1)]}。いちばん高いのは {k1} 回（予想は {guess} 回{guess === k1 ? "で、ぴったり" : ""}）。</Verdict>
      <Card title="理論と実験" sub="差が目安の中か"><CompareTable rows={rows} /></Card>
      <Card title={`後（p＝${pc(next.p)}）の分布：実験と理論`} sub={`${N.toLocaleString()} セット`}><CompareRows counts={B.counts} sets={N} pmf={f1} inEvent={(k) => k === k1} /></Card>
      <Card title="平均の移り変わり" sub="何セット目までか（倍々）">
        <RunChart title="平均の移り変わり" ylab="ここまでの平均" series={[{ name: "前", path: runningMean(A.ks), th: meanOf(f0), se: (i) => (2 * sdOf(f0)) / Math.sqrt(i) }, { name: "後", path: runningMean(B.ks), th: meanOf(f1), se: (i) => (2 * sdOf(f1)) / Math.sqrt(i) }]}
          note={`セット数が少ないうちは、平均が大きく揺れる。繰り返すほど、前は ${r2(meanOf(f0))}、後は ${r2(meanOf(f1))} の近くに落ち着く様子を見る。途中では、2本の線が近づいたり離れたりすることもある。`} />
      </Card>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ {r2(meanOf(f1))} が中心？ 理由を考える</button>;
  } else if (stage === 3) {
    body = <>
      <Card title={def.reason?.title ?? "山の中心＝期待値 n×p"}>
        <table className={qs.table}><thead><tr><th /><th>前</th><th>後</th></tr></thead><tbody>
          <tr><td>1回の平均</td><td>{start.p}</td><td>{next.p}</td></tr><tr><td>n 回分（×{start.n}）</td><td>{r2(meanOf(f0))}</td><td>{r2(meanOf(f1))}</td></tr><tr><td>頂点</td><td>{k0} 回</td><td>{k1} 回</td></tr>
        </tbody></table>
        {def.reason?.steps.length ? <ol className={s.steps}>{def.reason.steps.map((t) => <li key={t}>{t}</li>)}</ol> : null}
      </Card>
      {props.workspace && <section className={s.ws} data-testid="exp-workspace"><p className={s.h}>式を動かして確かめる</p>{props.workspace(next, k1)}</section>}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>p を自由に変える</button>;
  } else {
    const fa = pmfOf(app), fb = pmfOf({ n: app.n, p: start.p });
    body = <>
      <Card title={`中心 n×p＝${r2(app.n * app.p)}`} sub={`頂点 ${peak(fa)} 回`}><PairRows labels={fa.map((_, k) => `${k} 回`)} a={fb} b={fa} names={[`p＝${pc(start.p)}`, `p＝${pc(app.p)}`]} pk={peak(fa)} /></Card>
      <AppExtra m={{ kind: "bernoulli", ...app }} from={def.question} onKeep={props.onKeep} onMemo={props.onMemo} desc={descOf({ kind: "bernoulli", ...app })} />
    </>;
    cta = <Dock chips={[["n", `n ${app.n} 回`], ["p", `p ${pc(app.p)}`]]} sel={sel} onSel={setSel} action={<button type="button" className={s.primary} onClick={props.onMenu} data-testid="exp-to-menu">別の問いへ</button>}>
      {sel === "n" ? <Field id="exp-app-n" label="1セットの回数 n" value={app.n} min={def.vary.n.min} max={def.vary.n.max} step={1} show={(v) => `${v} 回`} onChange={(n) => setApp({ ...app, n })} />
        : <Field id="exp-app-p" label="1回の成功確率 p" value={app.p} min={0.01} max={0.99} step={0.01} show={pc} onChange={(p) => setApp({ ...app, p })} />}
    </Dock>;
  }
  return <LabShell title={def.title} question={def.question} stage={stage} reached={reached} go={go} onBack={props.onBack} onInfo={props.onInfo} stages={STAGES_Q} body={body} cta={cta}>{props.children}</LabShell>;
}

// ---------------- 広がり：試行回数を増やすと分布はどう変わる？ ----------------
export function SpreadQ(props: QProps & { q: Extract<BinomQuestion, { form: "spread" }> }) {
  const { def, q } = props;
  const { stage, reached, go } = useStages(0);
  const n0 = q.set.n, n1 = q.to.n, p = q.set.p, sd = (n: number) => Math.sqrt(n * p * (1 - p));
  const [gC, setGC] = useState<number | null>(null), [gR, setGR] = useState<number | null>(null);
  const [theme, setTheme] = useState(def.themes[0]!);
  const { before: A, after: B, run } = usePairRuns({ kind: "bernoulli", n: n0, p }, { kind: "bernoulli", n: n1, p }, props.seed);
  const bins = (ks: number[], n: number, N: number) => { const b = Array(11).fill(0); ks.forEach((k) => { b[Math.round((k / n) * 10)]++; }); return b.map((c) => (N ? c / N : 0)); };
  const binLabels = Array.from({ length: 11 }, (_, i) => `${i * 10}%`);
  const [app, setApp] = useState<Cond>({ n: n1, p }), [sel, setSel] = useState("n");
  const ansC = sd(n1) > sd(n0) ? 0 : sd(n1) < sd(n0) ? 2 : 1, ansR = sd(n1) / n1 > sd(n0) / n0 ? 0 : sd(n1) / n1 < sd(n0) / n0 ? 2 : 1;
  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      <Card title={`n を ${n0} から ${n1} に`} sub={`p＝${pc(p)}`}><p className={qs.muted}>成功の<b>回数</b>（何回成功したか）と、成功の<b>割合</b>（回数÷n）の、両方の散らばりを予想する。</p></Card>
      <Card title="成功の回数の散らばりは？"><div className={s.choice} role="radiogroup" aria-label="回数の散らばりの予想">{SPREAD3.map((t, i) => <button key={t} type="button" role="radio" aria-checked={gC === i} onClick={() => { haptic(); setGC(i); }}>{t}</button>)}</div></Card>
      <Card title="成功の割合の散らばりは？"><div className={s.choice} role="radiogroup" aria-label="割合の散らばりの予想">{SPREAD3.map((t, i) => <button key={t} type="button" role="radio" aria-checked={gR === i} onClick={() => { haptic(); setGR(i); }}>{t}</button>)}</div></Card>
    </>;
    cta = <button type="button" className={s.primary} disabled={gC === null || gR === null} onClick={() => go(1)}>{gC === null || gR === null ? "2つとも予想を選ぶ" : "この予想で実験する"}</button>;
  } else if (stage === 1) {
    body = <>
      <Themes def={def} theme={theme} setTheme={setTheme} />
      <Card title="いまの1セット"><div className={s.lanes}><Lane tag={`n＝${n0}`} last={A.last} n={n0} theme={theme} testid="exp-set-before" cls={s.laneB} /><Lane tag={`n＝${n1}`} last={B.last} n={n1} theme={theme} testid="exp-set" cls={s.laneA} /></div></Card>
      <Card title="成功の割合ごとのセット" sub={`各 ${A.sets.toLocaleString()} セット`}><PairRows labels={binLabels} a={bins(A.ks, n0, A.sets)} b={bins(B.ks, n1, B.sets)} names={[`n＝${n0}`, `n＝${n1}`]} /></Card>
    </>;
    cta = <RunButtons run={run} sets={A.sets} need={100} go={() => go(2)} />;
  } else if (stage === 2) {
    const sdA = Math.sqrt(summarize(A).variance ?? NaN), sdB = Math.sqrt(summarize(B).variance ?? NaN), N = A.sets;
    body = <>
      <Verdict ok={gC === ansC} head="成功の回数" big={`${r2(sd(n0))} → ${r2(sd(n1))}`} testid="exp-verdict-count">回数の標準偏差は {r2(sd(n1) / sd(n0))} 倍に<b>{SPREAD3[ansC]}</b>（実験 {r2(sdA)} → {r2(sdB)}）。予想は「{SPREAD3[gC!]}」。</Verdict>
      <Verdict ok={gR === ansR} head="成功の割合" big={`${pShort(sd(n0) / n0)} → ${pShort(sd(n1) / n1)}`} testid="exp-verdict-share">割合の標準偏差は {r2((sd(n1) / n1) / (sd(n0) / n0))} 倍に<b>{SPREAD3[ansR]}</b>（実験 {pShort(sdA / n0)} → {pShort(sdB / n1)}）。予想は「{SPREAD3[gR!]}」。</Verdict>
      <Card title="理論と実験" sub="差が目安の中か"><CompareTable rows={[
        { label: `回数の標準偏差（n＝${n0}）`, exp: sdA, th: sd(n0), se: (2 * sd(n0)) / Math.sqrt(2 * N) },
        { label: `回数の標準偏差（n＝${n1}）`, exp: sdB, th: sd(n1), se: (2 * sd(n1)) / Math.sqrt(2 * N) },
        { label: `割合の標準偏差（n＝${n0}）`, exp: sdA / n0, th: sd(n0) / n0, se: (2 * sd(n0)) / n0 / Math.sqrt(2 * N), fmt: pShort },
        { label: `割合の標準偏差（n＝${n1}）`, exp: sdB / n1, th: sd(n1) / n1, se: (2 * sd(n1)) / n1 / Math.sqrt(2 * N), fmt: pShort },
      ]} /></Card>
      <Card title="割合の散らばりの移り変わり" sub="何セット目までか（倍々）">
        <RunChart title="割合の散らばりの移り変わり" ylab="ここまでの標準偏差" fmt={pShort} series={[{ name: `n＝${n0}`, path: runningSd(A.ks, 1 / n0), th: sd(n0) / n0 }, { name: `n＝${n1}`, path: runningSd(B.ks, 1 / n1), th: sd(n1) / n1 }]}
          note={`はじめの数セットでは散らばりの値そのものが大きく揺れる。セットを重ねると、n＝${n0} は ${pShort(sd(n0) / n0)}、n＝${n1} は ${pShort(sd(n1) / n1)} の近くに落ち着いていく。`} />
      </Card>
      <Card title="成功の割合ごとのセット"><PairRows labels={binLabels} a={bins(A.ks, n0, N)} b={bins(B.ks, n1, N)} names={[`n＝${n0}`, `n＝${n1}`]} pk={Math.round(p * 10)} /></Card>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ逆の向き？ 理由を考える</button>;
  } else if (stage === 3) {
    body = <Card title="回数は √n 倍、割合は 1/√n 倍">
      <table className={qs.table}><thead><tr><th /><th>n＝{n0}</th><th>n＝{n1}</th></tr></thead><tbody>
        <tr><td>回数の分散 np(1−p)</td><td>{r2(sd(n0) ** 2)}</td><td>{r2(sd(n1) ** 2)}</td></tr>
        <tr><td>回数の標準偏差</td><td>{r2(sd(n0))}</td><td>{r2(sd(n1))}</td></tr>
        <tr><td>割合の標準偏差 √(p(1−p)/n)</td><td>{pShort(sd(n0) / n0)}</td><td>{pShort(sd(n1) / n1)}</td></tr>
      </tbody></table>
      <p className={qs.note}>分散は n に比例するので、標準偏差は √n に比例する。割合は回数を n で割るので、標準偏差は √n÷n＝1/√n に比例する。たくさん集めると割合が落ち着くのはこのため。</p>
    </Card>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>n を自由に変える</button>;
  } else {
    const sdc = Math.sqrt(app.n * app.p * (1 - app.p));
    body = <>
      <Card title={`n＝${app.n}・p＝${pc(app.p)}`}><div className={s.tiles}><div>回数の標準偏差<b>{r2(sdc)}</b><i>√(np(1−p))</i></div><div>割合の標準偏差<b>{pShort(sdc / app.n)}</b><i>√(p(1−p)/n)</i></div></div></Card>
      <Card title="理論の確率"><TheoryRows pmf={pmfOf(app)} /></Card>
      <AppExtra m={{ kind: "bernoulli", ...app }} from={q.title} onKeep={props.onKeep} onMemo={props.onMemo} desc={descOf({ kind: "bernoulli", ...app })} />
    </>;
    cta = <Dock chips={[["n", `n ${app.n} 回`], ["p", `p ${pc(app.p)}`]]} sel={sel} onSel={setSel} action={<button type="button" className={s.primary} onClick={props.onMenu} data-testid="exp-to-menu">別の問いへ</button>}>
      {sel === "n" ? <Field id="exp-app-n" label="1セットの回数 n" value={app.n} min={def.vary.n.min} max={Math.max(def.vary.n.max, n1)} step={1} show={(v) => `${v} 回`} onChange={(n) => setApp({ ...app, n })} />
        : <Field id="exp-app-p" label="1回の成功確率 p" value={app.p} min={0.01} max={0.99} step={0.01} show={pc} onChange={(pp) => setApp({ ...app, p: pp })} />}
    </Dock>;
  }
  return <LabShell title={def.title} question={q.question} stage={stage} reached={reached} go={go} onBack={props.onBack} onInfo={props.onInfo} stages={STAGES_Q} body={body} cta={cta}>{props.children}</LabShell>;
}

// ---------------- 確率の値：珍しい結果（自分で選ぶ）／ちょうど k 回と k 回以上（決まった問い） ----------------
export function ProbQ(props: QProps & { q: Extract<BinomQuestion, { form: "prob" }> }) {
  const [cur, setCur] = useState({ q: props.q, n: 0 });
  return <ProbRun key={cur.n} {...props} q={cur.q} onNew={(q) => setCur((c) => ({ q, n: c.n + 1 }))} />;
}
function ProbRun(props: QProps & { q: Extract<BinomQuestion, { form: "prob" }>; onNew: (q: Extract<BinomQuestion, { form: "prob" }>) => void }) {
  const { def, q } = props;
  const free = !!q.free;
  const { stage, reached, go } = useStages(0);
  const [cond, setCond] = useState<Cond>(q.set);
  const [events, setEvents] = useState<Ev[]>(q.events);
  const scale = def.prob_scale ?? [0.5, 0.2, 0.05, 0.01, 0.001];
  const sc = scaleChoices(scale);
  const [guess, setGuess] = useState<(number | undefined)[]>(() => q.events.map(() => undefined));
  const [focus, setFocus] = useState(0);
  const [theme, setTheme] = useState(def.themes[0]!);
  const f = useMemo(() => pmfOf(cond), [cond.n, cond.p]);   // eslint-disable-line react-hooks/exhaustive-deps
  const Ps = events.map((e) => probOf(f, e));
  const { rec, run } = useRuns({ kind: "bernoulli", ...cond }, props.seed);
  const hits = events.map((e) => rec.ks.filter(inEv(e)).length);
  const firsts = events.map((e) => { const i = rec.ks.findIndex(inEv(e)); return i < 0 ? null : i + 1; });
  const e0 = events[focus] ?? events[0]!, N = rec.sets;
  const [app, setApp] = useState<{ n: number; p: number; op: Op; k: number }>({ ...cond, ...events[0]! }), [sel, setSel] = useState("k");
  const question = free ? `成功確率 ${pc(cond.p)} で、${cond.n} 回中 ${evText(events[0]!)}成功する確率は？` : q.question;
  const focusSeg = events.length > 1 ? <Seg name="図で塗る結果" items={events.map((e, i) => [String(i), `${evText(e)}を塗る`] as [string, string])} value={String(focus)} onChange={(v) => setFocus(Number(v))} /> : null;
  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      {free ? <>
        <Card title="条件" sub={`1セット＝${cond.n} 回`}>
          <Field id="exp-n" label="1セットの回数 n" value={cond.n} min={def.vary.n.min} max={def.vary.n.max} step={1} show={(v) => `${v} 回`} onChange={(n) => { setCond({ ...cond, n }); setEvents([{ ...events[0]!, k: Math.min(events[0]!.k, n) }]); setGuess([undefined]); }} />
          <Field id="exp-p" label="1回の成功確率 p" value={cond.p} min={0.01} max={0.99} step={0.01} show={pc} onChange={(p) => { setCond({ ...cond, p }); setGuess([undefined]); }} />
        </Card>
        <Card title="どんな結果を調べる？">
          <Seg name="数え方" items={[["eq", "ちょうど"], ["ge", "以上"], ["le", "以下"]]} value={events[0]!.op} onChange={(op) => { setEvents([{ ...events[0]!, op }]); setGuess([undefined]); }} />
          <div className={s.kStep}>
            <button type="button" aria-label="k を減らす" disabled={events[0]!.k <= 0} onClick={() => { setEvents([{ ...events[0]!, k: events[0]!.k - 1 }]); setGuess([undefined]); }}>−</button>
            <b>{events[0]!.k} 回</b>
            <button type="button" aria-label="k を増やす" disabled={events[0]!.k >= cond.n} onClick={() => { setEvents([{ ...events[0]!, k: events[0]!.k + 1 }]); setGuess([undefined]); }}>＋</button>
          </div>
          <p className={s.event} data-testid="exp-event">{cond.n} 回中 {evText(events[0]!)} 成功</p>
        </Card>
      </> : <Card title={`n＝${cond.n}・p＝${pc(cond.p)}`}><p className={qs.muted}>成功確率 {pc(cond.p)} の試行を {cond.n} 回。これを1セットとして何度も起こす。</p></Card>}
      {events.map((e, i) => <Card key={i} title={`${evText(e)}になる確率は？`} sub="桁で選ぶ"><ScaleChoice name={`${evText(e)} の確率の予想`} scale={scale} value={guess[i]} onChange={(j) => setGuess(guess.map((g, x) => (x === i ? j : g)))} /></Card>)}
    </>;
    const ready = guess.every((g) => g !== undefined);
    cta = <button type="button" className={s.primary} disabled={!ready} onClick={() => go(1)}>{ready ? "この予想で実験する" : "まず予想を選ぶ"}</button>;
  } else if (stage === 1) {
    body = <>
      <Themes def={def} theme={theme} setTheme={setTheme} />
      <Card title="いまの1セット"><div className={s.lanes}><Lane tag={`p＝${pc(cond.p)}・n＝${cond.n}`} last={rec.last} n={cond.n} theme={theme} testid="exp-set" /></div></Card>
      <Card title="当てはまったセット" sub={`${N.toLocaleString()} セット`} testid="exp-hits">
        <div className={s.tiles}>{events.map((e, i) => <div key={i} data-testid={`exp-hit-${i}`}>{evText(e)}<b>{hits[i]!.toLocaleString()}<small> ／ {N.toLocaleString()}</small></b><i>{N ? pctSig(hits[i]! / N) : "—"}{firsts[i] ? `・初めては ${firsts[i]} セット目` : ""}</i></div>)}</div>
      </Card>
      <Card title="成功の回数ごとのセット数">{focusSeg}<DistRows counts={rec.counts} sets={N} inEvent={inEv(e0)} /></Card>
    </>;
    cta = <RunButtons run={run} sets={N} need={100} go={() => go(2)} />;
  } else if (stage === 2) {
    const rel = events.length === 2 && events[0]!.op === "eq" && events[1]!.op === "ge" && events[0]!.k === events[1]!.k;
    body = <>
      {events.map((e, i) => {
        const P = Ps[i]!, ans = sc.of(P), g = guess[i]!, edge = sc.nearEdge(P) && Math.abs(g - ans) === 1, exp = N * P;
        return <Verdict key={i} ok={g === ans} edge={edge} head={evText(e)} big={pctSig(P)} testid={`exp-verdict-${i}`}>
          {oneIn(P)}。目盛りでは「{sc.labels[ans]}」、予想は「{sc.labels[g]}」。この回数での見込み {fmtN(exp)} 回、実際は {hits[i]} 回{exp < 1 && hits[i] === 0 ? "（見込みが1回より少ないので、0 回がふつう。確率 0 ではない）" : ""}。
        </Verdict>;
      })}
      {(rel || Ps.some((P) => P < 0.05)) && <Card title="読み方">
        {rel && <p className={qs.note} data-testid="exp-compare-note">{evText(events[1]!)}には、ちょうど {events[0]!.k} 回も入る。{events[1]!.k} 回以上＝ちょうど {events[1]!.k}・{events[1]!.k + 1}・…・{cond.n} 回の棒の合計で、ちょうど {events[0]!.k} 回はその {pc(Ps[0]! / Math.max(1e-12, Ps[1]!))}。</p>}
        {Ps.some((P) => P < 0.05) && <p className={qs.note}>5% より小さい結果を「珍しい」と呼ぶことが多い。検定の有意水準はこの考え方。</p>}
      </Card>}
      <Card title="理論と実験" sub="差が目安の中か"><CompareTable rows={events.flatMap((e, i) => [
        { label: `${evText(e)}の割合`, exp: hits[i]! / Math.max(1, N), th: Ps[i]!, se: 2 * Math.sqrt((Ps[i]! * (1 - Ps[i]!)) / Math.max(1, N)), fmt: pShort },
        { label: `${evText(e)}の回数`, exp: hits[i]!, th: N * Ps[i]!, se: 2 * Math.sqrt(N * Ps[i]! * (1 - Ps[i]!)), fmt: fmtN },
      ])} /></Card>
      <Card title="分布：実験と理論" sub={`${N.toLocaleString()} セット`}>{focusSeg}<CompareRows counts={rec.counts} sets={N} pmf={f} inEvent={inEv(e0)} /></Card>
      <Card title="当てはまった割合の移り変わり" sub="何セット目までか（倍々）">
        <RunChart title="当てはまった割合の移り変わり" ylab="ここまでの割合" fmt={pShort} series={[{ name: "実験", path: runningShare(rec.ks.map(inEv(e0))), th: Ps[focus]!, se: (i) => 2 * Math.sqrt((Ps[focus]! * (1 - Ps[focus]!)) / i) }]}
          note={Ps[focus]! < 0.05 ? `珍しい結果は、起きるたびに割合が跳ね上がり、起きないあいだは下がっていく。セットを重ねると ${pctSig(Ps[focus]!)} の近くに落ち着いていくが、少ない回数では大きく外れることが多い。` : `セット数が少ないうちは割合が大きく揺れる。繰り返すほど ${pctSig(Ps[focus]!)} の近くに落ち着いていく様子を見る。`} />
      </Card>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜその確率？ 理由を考える</button>;
  } else if (stage === 3) {
    const ks = f.map((_, k) => k).filter(inEv(e0));
    body = <>
      <Card title={`棒を足す：${evText(e0)}`} sub={`${ks.length} 本`}>{focusSeg}
        <table className={qs.table} data-testid="exp-sum"><thead><tr><th>成功の回数</th><th>確率</th><th>セットに1回</th></tr></thead><tbody>
          {ks.slice(0, 12).map((k) => <tr key={k}><td>k＝{k}</td><td>{pctSig(f[k]!)}</td><td>{oneIn(f[k]!).replace("セットに1回", "")}</td></tr>)}
          {ks.length > 12 && <tr><td colSpan={3}>…ほか {ks.length - 12} 本</td></tr>}
          <tr><td><b>合計</b></td><td><b data-testid="exp-sum-total">{pctSig(Ps[focus]!)}</b></td><td><b>{oneIn(Ps[focus]!).replace("セットに1回", "")}</b></td></tr>
        </tbody></table>
        <p className={qs.note}>1本の棒は P(X＝k)＝ₙCₖ pᵏ(1−p)ⁿ⁻ᵏ。{e0.op === "eq" ? "ちょうど k 回は棒1本。" : "以上・以下は当てはまる棒を全部足す。"}{e0.op === "eq" && e0.k === cond.n ? `全部成功は並びが1通り（ₙCₙ＝1）なので、p を ${cond.n} 回掛けるだけ。` : ""}</p>
      </Card>
      {props.workspace && <section className={s.ws} data-testid="exp-workspace"><p className={s.h}>式を動かして確かめる<span>k を動かすと棒1本の確率</span></p>{props.workspace(cond, ks[0] ?? 0)}</section>}
    </>;
    cta = <button type="button" className={s.primary} onClick={() => { setApp({ ...cond, ...e0 }); go(4); }}>{free ? "どこから珍しい？ を探す" : "k を自由に変える"}</button>;
  } else {
    const fa = pmfOf(app), e: Ev = { op: free ? app.op : "ge", k: Math.min(app.k, app.n) }, P = probOf(fa, e);
    const ks = fa.map((_, k) => k);
    const cut = e.op === "ge" ? ks.find((k) => probOf(fa, { op: "ge", k }) < 0.05) : e.op === "le" ? [...ks].reverse().find((k) => probOf(fa, { op: "le", k }) < 0.05) : undefined;
    const eq = probOf(fa, { op: "eq", k: e.k }), ge1 = probOf(fa, { op: "ge", k: e.k + 1 });
    body = <>
      {free ? <Card title={evText(e)} sub={`n＝${app.n}・p＝${pc(app.p)}`} testid="exp-app">
        <div className={s.tiles}><div>確率<b data-testid="exp-app-prob">{pctSig(P)}</b><i>{oneIn(P)}</i></div><div>5% を切る境目<b data-testid="exp-app-cut">{e.op === "eq" ? "—" : cut === undefined ? "なし" : evText({ op: e.op, k: cut })}</b><i>{e.op === "eq" ? "ちょうどでは決めない" : cut === undefined ? "どこまで行っても 5% 以上" : "ここから先が「珍しい」"}</i></div></div>
        <p className={qs.note}>{e.op === "eq" ? `ちょうど k 回の確率は、n が大きいほどどの k でも小さくなる（今はいちばん高い棒でも ${pctSig(Math.max(...fa))}）。だから珍しさは「以上」「以下」のように、それより極端な結果をまとめて測る。` : `${P < 0.05 ? "この結果は 5% より起きにくい。" : "この結果は 5% 以上の確率で起きる。"}5% の境目は、検定で「偶然とは言いにくい」と判断する目安になる。`}</p>
      </Card> : <Card title={`ちょうど ${e.k} 回と ${e.k} 回以上`} sub={`n＝${app.n}・p＝${pc(app.p)}`} testid="exp-app">
        <div className={s.tiles}><div>ちょうど {e.k} 回<b>{pctSig(eq)}</b><i>棒1本</i></div><div>{e.k} 回以上<b>{pctSig(P)}</b><i>＝ちょうど {e.k} 回＋{e.k + 1} 回以上（{pctSig(ge1)}）</i></div></div>
      </Card>}
      <Card title="理論の確率"><TheoryRows pmf={fa} inEvent={inEv(e)} /></Card>
      <AppExtra m={{ kind: "bernoulli", n: app.n, p: app.p }} from={q.title} onKeep={props.onKeep} onMemo={props.onMemo} desc={`${descOf({ kind: "bernoulli", n: app.n, p: app.p })}・${evText(e)}`} />
    </>;
    const chips: [string, string][] = [["n", `n ${app.n} 回`], ["p", `p ${pc(app.p)}`], ...(free ? [["op", { eq: "ちょうど", ge: "以上", le: "以下" }[app.op]] as [string, string]] : []), ["k", `k ${e.k} 回`]];
    cta = <Dock chips={chips} sel={sel} onSel={setSel} action={free
      ? <button type="button" className={s.primary} data-testid="exp-app-go" onClick={() => props.onNew({ ...q, id: `${q.id}-own`, set: { n: app.n, p: app.p }, events: [e] })}>この条件で予想から</button>
      : <button type="button" className={s.primary} onClick={props.onMenu} data-testid="exp-to-menu">別の問いへ</button>}>
      {sel === "n" ? <Field id="exp-app-n" label="1セットの回数 n" value={app.n} min={def.vary.n.min} max={def.vary.n.max} step={1} show={(v) => `${v} 回`} onChange={(n) => setApp({ ...app, n, k: Math.min(app.k, n) })} />
        : sel === "p" ? <Field id="exp-app-p" label="1回の成功確率 p" value={app.p} min={0.01} max={0.99} step={0.01} show={pc} onChange={(p) => setApp({ ...app, p })} />
        : sel === "op" ? <Seg name="数え方" items={[["eq", "ちょうど"], ["ge", "以上"], ["le", "以下"]]} value={app.op} onChange={(op) => setApp({ ...app, op })} />
        : <Field id="exp-app-k" label="k（成功の回数）" value={e.k} min={0} max={app.n} step={1} show={(v) => `${v} 回`} onChange={(k) => setApp({ ...app, k })} />}
    </Dock>;
  }
  return <LabShell title={def.title} question={question} stage={stage} reached={reached} go={go} onBack={props.onBack} onInfo={props.onInfo} stages={STAGES_Q} body={body} cta={cta}>{props.children}</LabShell>;
}

// ---------------- 理論と実測：回数を増やすと割合は理論に近づく？ ----------------
const CONV3 = ["100分の1", "10分の1", "変わらない"] as const;
export function ConvQ(props: QProps & { q: Extract<BinomQuestion, { form: "conv" }> }) {
  const { def, q } = props;
  const { stage, reached, go } = useStages(0);
  const ev = q.events[0]!, cond = q.set, f = useMemo(() => pmfOf(cond), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const P = probOf(f, ev), se = (N: number) => 2 * Math.sqrt((P * (1 - P)) / N);
  const [guess, setGuess] = useState<number | null>(null);
  const { rec, run } = useRuns({ kind: "bernoulli", ...cond }, props.seed);
  const path = useMemo(() => runningShare(rec.ks.map(inEv(ev))), [rec]);   // eslint-disable-line react-hooks/exhaustive-deps
  const N = rec.sets, share = path[N - 1];
  const [app, setApp] = useState({ ...cond, k: ev.k }), [sel, setSel] = useState("k");
  const chart = (note: string) => <RunChart title="割合の移り変わり" ylab="ここまでの割合" fmt={pShort} series={[{ name: "実験", path, th: P, se }]} note={note} />;
  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      <Card title={`${cond.n} 回中 ${evText(ev)}`} sub={`理論 ${pctSig(P)}`}><p className={qs.muted}>1セット＝{cond.n} 回（成功確率 {pc(cond.p)}）。{evText(ev)}になったセットの割合は、セットを重ねると理論の {pctSig(P)} に近づくか。近づくなら、どんな速さか。</p></Card>
      <Card title="セットを 100 倍にすると、理論とのずれの目安は？"><div className={s.choice} role="radiogroup" aria-label="ずれの予想">{CONV3.map((t, i) => <button key={t} type="button" role="radio" aria-checked={guess === i} onClick={() => { haptic(); setGuess(i); }}>{t}</button>)}</div></Card>
    </>;
    cta = <button type="button" className={s.primary} disabled={guess === null} onClick={() => go(1)}>{guess === null ? "まず予想を選ぶ" : "この予想で実験する"}</button>;
  } else if (stage === 1) {
    body = <>
      {N > 0 && <Card title="割合の移り変わり" sub="何セット目までか（倍々）">{chart("セット数が少ないうちは割合が大きく揺れる。繰り返すほど理論の近くに落ち着いていく様子を見る。")}</Card>}
      <Card title="ここまで" sub={`${N.toLocaleString()} セット`}><div className={s.tiles}><div>ここまでの割合<b>{share === undefined ? "—" : pctSig(share)}</b><i>理論 {pctSig(P)}</i></div><div>理論とのずれ<b>{share === undefined ? "—" : pShort(Math.abs(share - P))}</b><i>目安 ±{N ? pShort(se(N)) : "—"}</i></div></div></Card>
    </>;
    cta = <>
      <div className={s.two} style={{ gridTemplateColumns: "1fr 1fr 1.3fr" }}>
        <button type="button" className={s.secondary} onClick={() => run(10)} data-testid="exp-run-10">10</button>
        <button type="button" className={s.secondary} onClick={() => run(Math.max(100, N * 9), 200)} data-testid="exp-run-x10">×10</button>
        <button type="button" className={s.primary} disabled={N >= 10000} onClick={() => run(10000 - N, 500)} data-testid="exp-run-big">▶ 10000 まで</button>
      </div>
      <button type="button" className={s.next} disabled={N < 1000} onClick={() => go(2)} data-testid="exp-to-observe">{N < 1000 ? `あと ${1000 - N} セットで観察できる` : "観察する →"}</button>
    </>;
  } else if (stage === 2) {
    const at = [10, 100, 1000, 10000].filter((t) => t <= N);
    body = <>
      <Verdict ok={guess === 1} big="10分の1">ずれの目安は √(セット数) に反比例する。セットを 100 倍にすると √100＝10 で、10分の1。予想は「{CONV3[guess!]}」。</Verdict>
      <Card title="理論と実験" sub="差が目安の中か"><CompareTable rows={[{ label: `${N.toLocaleString()} セットの割合`, exp: share, th: P, se: se(N), fmt: pShort }]} /></Card>
      <Card title="ずれと目安" sub={`理論 ${pctSig(P)}`}>
        <table className={qs.table} data-testid="exp-conv-table"><thead><tr><th>セット</th><th>実際のずれ</th><th>目安 ±2SE</th></tr></thead><tbody>
          {at.map((t) => <tr key={t}><td>{t.toLocaleString()}</td><td>{pShort(Math.abs(path[t - 1]! - P))}</td><td>±{pShort(se(t))}</td></tr>)}
        </tbody></table>
        <p className={qs.note}>実際のずれは毎回ゆれる。目安より大きいこともあるし、たまたま小さいこともある。それでも、セットを増やすほど小さくなっていく。</p>
      </Card>
      <Card title="割合の移り変わり" sub="何セット目までか（倍々）">{chart("目安の帯は √(セット数) に反比例して細くなる。線は多くの場合この帯の中にあるが、外に出ることもある。")}</Card>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ √ で縮む？ 理由を考える</button>;
  } else if (stage === 3) {
    body = <Card title="割合のずれの目安＝√(P(1−P)÷N)">
      <table className={qs.table}><thead><tr><th>セット N</th><th>√N</th><th>目安 ±2SE</th></tr></thead><tbody>{[100, 10000].map((t) => <tr key={t}><td>{t.toLocaleString()}</td><td>{Math.sqrt(t)}</td><td>±{pShort(se(t))}</td></tr>)}</tbody></table>
      <p className={qs.note}>1セットごとに「当てはまる・当てはまらない」の 0 か 1。割合はその平均なので、分散は P(1−P)÷N、ずれの目安は √N に反比例する（試行回数を増やす問いの「割合の標準偏差」と同じ形）。</p>
      <p className={qs.note}>「どんな分布でも同じように近づくか？」は、大数の法則の実験室で確かめる。</p>
    </Card>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>条件を自由に変える</button>;
  } else {
    const Pa = probOf(pmfOf(app), { op: ev.op, k: Math.min(app.k, app.n) }), sea = (n: number) => 2 * Math.sqrt((Pa * (1 - Pa)) / n);
    body = <>
      <Card title={`${app.n} 回中 ${evText({ op: ev.op, k: Math.min(app.k, app.n) })}`} sub={`理論 ${pctSig(Pa)}`}>
        <table className={qs.table}><thead><tr><th>セット</th><th>ずれの目安</th></tr></thead><tbody>{[100, 1000, 10000, 100000].map((t) => <tr key={t}><td>{t.toLocaleString()}</td><td>±{pShort(sea(t))}</td></tr>)}</tbody></table>
        <p className={qs.note}>{Pa < 0.05 || Pa > 0.95 ? "理論の確率が 0 や 1 に近いと、ずれの目安も小さい。ただし珍しい結果は、そもそも起きた回数が少ない。" : "セットを 100 倍にするたびに、目安は 10分の1。"}</p>
      </Card>
      <AppExtra m={{ kind: "bernoulli", n: app.n, p: app.p }} from={q.title} onKeep={props.onKeep} onMemo={props.onMemo} desc={descOf({ kind: "bernoulli", n: app.n, p: app.p })} />
    </>;
    cta = <Dock chips={[["n", `n ${app.n} 回`], ["p", `p ${pc(app.p)}`], ["k", `k ${Math.min(app.k, app.n)} 回`]]} sel={sel} onSel={setSel} action={<button type="button" className={s.primary} onClick={props.onMenu} data-testid="exp-to-menu">別の問いへ</button>}>
      {sel === "n" ? <Field id="exp-app-n" label="1セットの回数 n" value={app.n} min={def.vary.n.min} max={def.vary.n.max} step={1} show={(v) => `${v} 回`} onChange={(n) => setApp({ ...app, n, k: Math.min(app.k, n) })} />
        : sel === "p" ? <Field id="exp-app-p" label="1回の成功確率 p" value={app.p} min={0.01} max={0.99} step={0.01} show={pc} onChange={(p) => setApp({ ...app, p })} />
        : <Field id="exp-app-k" label={`k（${evText({ op: ev.op, k: 0 }).replace("0 ", "")}）`} value={Math.min(app.k, app.n)} min={0} max={app.n} step={1} show={(v) => `${v} 回`} onChange={(k) => setApp({ ...app, k })} />}
    </Dock>;
  }
  return <LabShell title={def.title} question={q.question} stage={stage} reached={reached} go={go} onBack={props.onBack} onInfo={props.onInfo} stages={STAGES_Q} body={body} cta={cta}>{props.children}</LabShell>;
}

// ---------------- 前提崩し：成り立つ条件を崩してみる ----------------
type Cx = NonNullable<BinomDef["counterexamples"]>[number];
const STRENGTH: Record<string, [string, number, number, number, keyof Cx["mechanism"]]> = {
  streak: ["引きずる強さ", 0.05, 0.6, 0.05, "carry"], mix: ["ずれ幅 d", 0.05, 0.4, 0.05, "spread"], fatigue: ["下がる幅 d", 0.05, 0.4, 0.05, "drop"], urn: ["箱の数", 12, 60, 2, "total"],
};
/** 反例の定義から起き方を作る（比べる二項分布は、戻さずに取るだけ箱の当たりの割合にそろえる） */
export function mechOfCx(cx: Cx, c: Cond, x?: number): Mechanism {
  const m = cx.mechanism;
  if (m.kind === "urn") { const total = Math.max(c.n, x ?? m.total ?? 40); return { kind: "urn", n: c.n, total, success: m.success ?? Math.round(c.p * total) }; }
  if (m.kind === "streak") return { kind: "streak", n: c.n, p: c.p, carry: x ?? m.carry ?? 0.3 };
  if (m.kind === "fatigue") return { kind: "fatigue", n: c.n, p: c.p, drop: x ?? m.drop ?? 0.3 };
  return { kind: "mix", n: c.n, p: c.p, spread: x ?? m.spread ?? 0.2 };
}
const baseOf = (m: Mechanism, c: Cond): Cond => (m.kind === "urn" ? { n: c.n, p: m.success / m.total } : c);
export function BreakQ(props: QProps) {
  const { def } = props;
  const cxs = def.counterexamples ?? [];
  const [cxId, setCxId] = useState<string>(cxs[0]?.id ?? "");
  const cx = cxs.find((x) => x.id === cxId) ?? cxs[0]!;
  const [guess, setGuess] = useState<number | null>(null);
  const { stage, reached, go } = useStages(0);
  const cond: Cond = def.start;
  const m = mechOfCx(cx, cond), b = baseOf(m, cond), vb = b.n * b.p * (1 - b.p), vm = mechanismMoments(m).variance;
  const ans = Math.abs(vm - vb) <= 1e-9 * Math.max(1, vb) ? 1 : vm > vb ? 0 : 2;
  const [theme, setTheme] = useState(def.themes[0]!);
  const { before: A, after: B, run } = usePairRuns({ kind: "bernoulli", ...b }, m, props.seed);
  const st = STRENGTH[m.kind]!;
  const xOf = (c: Cx) => { const k = STRENGTH[c.mechanism.kind]![4]; return Number(c.mechanism[k] ?? (c.mechanism.kind === "urn" ? 40 : c.mechanism.kind === "mix" ? 0.2 : 0.3)); };
  const [x, setX] = useState<number>(() => xOf(cx));
  const labels = Array.from({ length: cond.n + 1 }, (_, k) => `${k} 回`);
  let body: ReactNode, cta: ReactNode;
  if (stage === 0) {
    body = <>
      <Card title="どの条件を崩す？">
        <div className={s.menu}>{cxs.map((c) => <button key={c.id} type="button" className={s.menuItem} aria-pressed={c.id === cx.id} onClick={() => { haptic(); setCxId(c.id); setGuess(null); setX(xOf(c)); }} data-testid={`exp-bnd-${c.id}`}><span className={s.form}>崩す：{c.breaks}</span><b>{c.name}</b></button>)}</div>
      </Card>
      <Card title={`二項分布（n＝${b.n}・p＝${pc(b.p)}）と比べて、山の広がりは？`}><div className={s.choice} role="radiogroup" aria-label="広がりの予想">{SPREAD3.map((t, i) => <button key={t} type="button" role="radio" aria-checked={guess === i} onClick={() => { haptic(); setGuess(i); }}>{t}</button>)}</div></Card>
    </>;
    cta = <button type="button" className={s.primary} disabled={guess === null} onClick={() => go(1)}>{guess === null ? "まず予想を選ぶ" : "この予想で実験する"}</button>;
  } else if (stage === 1) {
    body = <>
      <Themes def={def} theme={theme} setTheme={setTheme} />
      <Card title="いまの1セット"><div className={s.lanes}><Lane tag="条件どおり（二項分布）" last={A.last} n={cond.n} theme={theme} testid="exp-cx-set-before" cls={s.laneB} /><Lane tag={`崩した：${cx.name}`} last={B.last} n={cond.n} theme={theme} testid="exp-cx-set" cls={s.laneA} /></div></Card>
      <Card title="成功の回数ごとの割合" sub={`各 ${A.sets.toLocaleString()} セット`}><PairRows labels={labels} a={summarize(A).freq} b={summarize(B).freq} names={["条件どおり", "崩した"]} /></Card>
    </>;
    cta = <RunButtons run={run} sets={A.sets} need={100} go={() => go(2)} />;
  } else if (stage === 2) {
    const vA = summarize(A).variance ?? NaN, vB = summarize(B).variance ?? NaN, N = A.sets;
    body = <>
      <Verdict ok={guess === ans} testid="exp-cx-verdict">山は二項分布より<b>{["広くなる", "変わらない", "狭くなる"][ans]}</b>。理論の分散：崩した起き方 {r2(vm)}・二項分布 {r2(vb)}。実験：崩した {r2(vB)}・条件どおり {r2(vA)}。予想は「{SPREAD3[guess!]}」。</Verdict>
      <Card title="理論と実験" sub="差が目安の中か"><CompareTable rows={[
        { label: "平均（条件どおり）", exp: summarize(A).mean, th: b.n * b.p, se: 2 * Math.sqrt(vb / N) },
        { label: "平均（崩した）", exp: summarize(B).mean, th: b.n * b.p, se: 2 * Math.sqrt(vm / N) },
        { label: "分散（条件どおり）と二項分布", exp: vA, th: vb, se: 2 * vb * Math.sqrt(2 / N) },
        { label: "分散（崩した）と二項分布", exp: vB, th: vb, se: 2 * vb * Math.sqrt(2 / N) },
        { label: "分散（崩した）と起き方の理論", exp: vB, th: vm, se: 2 * vm * Math.sqrt(2 / N) },
      ]} /><p className={qs.note}>崩した方の分散を二項分布の理論と比べると、目安の外に出やすい。二項分布の前提が合っていないしるし。目安は正規分布を仮定したおおよその幅。</p></Card>
      <Card title="崩した起き方の分布と二項分布" sub={`${N.toLocaleString()} セット`}><CompareRows counts={B.counts} sets={N} pmf={pmfOf(b)} thName="二項分布" /></Card>
      <Card title="散らばり（分散）の移り変わり" sub="何セット目までか（倍々）">
        <RunChart title="散らばり（分散）の移り変わり" ylab="ここまでの分散" series={[{ name: "条件どおり", path: runningSd(A.ks).map((v) => v * v), th: vb }, { name: "崩した", path: runningSd(B.ks).map((v) => v * v), th: vm }]}
          note={`平均はどちらも ${r2(b.n * b.p)} の近くに落ち着くが、散らばりは別の値に落ち着いていく（条件どおり ${r2(vb)}・崩した ${r2(vm)}）。はじめの数セットでは、どちらが大きいかが入れ替わることもある。`} />
      </Card>
    </>;
    cta = <button type="button" className={s.primary} onClick={() => go(3)}>なぜ{["広く", "変わらず", "狭く"][ans]}なる？ 理由を考える</button>;
  } else if (stage === 3) {
    body = <Card title={`崩した条件：${cx.breaks}`}><p className={qs.note} data-testid="exp-cx-text">{cx.text}</p><p className={qs.note}>二項分布の式（分散 np(1−p)）を使えるのは、各回が独立で、毎回同じ確率のときだけ。</p>{cx.concept && props.conceptLink?.(cx.concept)}</Card>;
    cta = <button type="button" className={s.primary} onClick={() => go(4)}>崩す強さを変える</button>;
  } else {
    const ma = mechOfCx(cx, cond, x), ba = baseOf(ma, cond), vma = mechanismMoments(ma).variance, vba = ba.n * ba.p * (1 - ba.p);
    body = <>
      <Card title={cx.name} sub={`${st[0]} ${x}`} testid="exp-app">
        <div className={s.tiles}><div>分散（崩した）<b>{r2(vma)}</b><i>理論</i></div><div>分散（二項分布）<b>{r2(vba)}</b><i>n×p×(1−p)</i></div></div>
        <p className={qs.note}>{Math.abs(vma - vba) <= 1e-9 * Math.max(1, vba) ? "この強さでは差が出ない。" : `崩した方が ${vma > vba ? "広い" : "狭い"}（${r2(vma / vba)} 倍）。`}{ma.kind === "urn" ? "箱が大きいほど、戻さなくても二項分布に近づく。" : "強さが 0 なら二項分布と同じ。"}</p>
      </Card>
      <Card title="理論の確率（二項分布）"><TheoryRows pmf={pmfOf(ba)} /></Card>
      <AppExtra m={ma as CardMechanism} from={`前提崩し：${cx.name}`} onKeep={props.onKeep} onMemo={props.onMemo} desc={`${cx.name}・n＝${cond.n}・p＝${pc(ba.p)}・${st[0]} ${x}`} />
    </>;
    cta = <Dock chips={[["s", st[0]]]} sel="s" onSel={() => {}} action={<button type="button" className={s.primary} onClick={props.onMenu} data-testid="exp-to-menu">別の問いへ</button>}>
      <Field id="exp-app-s" label={st[0]} value={x} min={st[1]} max={st[2]} step={st[3]} show={(v) => (ma.kind === "urn" ? `${v} 個` : String(v))} onChange={setX} />
    </Dock>;
  }
  return <LabShell title={def.title} question={`「${cx.name}」とき、成功の回数の山は二項分布と比べてどうなる？`} stage={stage} reached={reached} go={go} onBack={props.onBack} onInfo={props.onInfo} stages={STAGES_Q} body={body} cta={cta}>{props.children}</LabShell>;
}
