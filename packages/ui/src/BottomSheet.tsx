// 地図の上に重なる、いつも出ている下からの面（stats2-course #42：Apple の地図アプリのような手触り）。
// - 3つの段：少し（peek）・半分（half）・全部（full）。上のつまみと見出しの行を指でつかんで動かす。つまみを押すと次の段へ
// - 離すと、指の速さを足した位置にいちばん近い段へ、ばね（--ease-spring）で止まる。上下の端はゴムのように少しだけ伸びる
// - 全部のときだけ後ろを暗くし、暗い所を押すと半分に戻る。半分以下では後ろ（地図）も触れる
// - 中身は本文の中で縦に動かす。閉じる操作は持たない（選ぶのをやめると親が外す）
// - 動きを減らす設定では、すっと動かず段に切り替わるだけ（base.css）
import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent as RPE, type ReactNode } from "react";
import { haptic } from "./motion";
import s from "./BottomSheet.module.css";

export type Detent = "peek" | "half" | "full";
export const DETENTS: Detent[] = ["peek", "half", "full"];

/**
 * 離したときに止まる段を決める（純粋な計算。テストで確かめる）。
 * h：今の高さ（px）、v：指の速さ（px/ms。上向きが＋）、heights：段ごとの高さ。
 * 速さを 0.18 秒ぶん先へ進めた位置にいちばん近い段。速く払ったときは少なくとも1段は進む。
 */
export function snapDetent(h: number, v: number, heights: Record<Detent, number>): Detent {
  const projected = h + v * 180;
  let best: Detent = "peek", dist = Infinity;
  for (const d of DETENTS) { const x = Math.abs(heights[d] - projected); if (x < dist) { dist = x; best = d; } }
  if (Math.abs(v) > 0.5) {   // 速く払った：今の高さから払った向きに次の段へ（戻りはしない）
    const order = DETENTS.map((d) => heights[d]);
    const next = v > 0 ? DETENTS.find((_, i) => order[i]! > h + 1) : [...DETENTS].reverse().find((d) => heights[d] < h - 1);
    if (next && (v > 0 ? heights[next] > heights[best] : heights[next] < heights[best])) best = next;
  }
  return best;
}

/** 端を越えた分をゴムのように縮める（越えた量の平方根に近い形で、だんだん重くなる） */
export function rubber(x: number, min: number, max: number): number {
  if (x > max) return max + Math.sqrt(x - max) * 4;
  if (x < min) return min - Math.sqrt(min - x) * 4;
  return x;
}

type Props = {
  label: string;
  /** 見出しの行（指でつかめる所） */
  header: ReactNode;
  children: ReactNode;
  detent: Detent;
  onDetent: (d: Detent) => void;
  /** 段の高さ（px）。peek は見出しと主の操作が見える高さ */
  peek?: number;
  /** 下の余白（下のタブの高さなど。面はその上に乗る） */
  bottom?: number;
} & Omit<HTMLAttributes<HTMLElement>, "title">;

const vh = () => (typeof window === "undefined" ? 800 : window.innerHeight);

export function BottomSheet({ label, header, children, detent, onDetent, peek = 220, bottom = 0, ...rest }: Props) {
  const heights = (): Record<Detent, number> => ({ peek, half: Math.round((vh() - bottom) * 0.55), full: vh() - bottom - 44 });
  const [drag, setDrag] = useState<number | null>(null);
  const [, force] = useState(0);
  const g = useRef<{ y0: number; h0: number; t: number; y: number; v: number; moved: boolean; grab: boolean } | null>(null);
  useEffect(() => { const r = () => force((n) => n + 1); addEventListener("resize", r); return () => removeEventListener("resize", r); }, []);

  const onDown = (e: RPE) => {
    if ((e.target as HTMLElement).closest("button:not([data-grab]), a, input, select")) return;
    g.current = { y0: e.clientY, h0: heights()[detent], t: e.timeStamp, y: e.clientY, v: 0, moved: false, grab: !!(e.target as HTMLElement).closest("[data-grab]") };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPE) => {
    const d = g.current; if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = -(e.clientY - d.y) / dt; d.t = e.timeStamp; d.y = e.clientY;   // 上向きが＋
    if (Math.abs(e.clientY - d.y0) > 4) d.moved = true;
    const hs = heights();
    setDrag(rubber(d.h0 - (e.clientY - d.y0), hs.peek, hs.full));
  };
  const onUp = (e: RPE) => {
    const d = g.current; g.current = null; if (!d) return;
    setDrag(null);
    if (!d.moved) {   // つまみを押しただけ：次の段へ（全部の次は少し）
      if (d.grab) { haptic(); onDetent(DETENTS[(DETENTS.indexOf(detent) + 1) % DETENTS.length]!); }
      return;
    }
    const next = snapDetent(d.h0 - (e.clientY - d.y0), d.v, heights());
    if (next !== detent) haptic();
    onDetent(next);
  };

  const hs = heights();
  const h = drag ?? hs[detent];
  const dim = drag !== null ? Math.max(0, Math.min(1, (drag - hs.half) / (hs.full - hs.half))) : detent === "full" ? 1 : 0;
  return (
    <>
      <div className={s.scrim} style={{ opacity: dim, pointerEvents: detent === "full" && drag === null ? "auto" : "none", transition: drag !== null ? "none" : undefined }}
        onClick={() => onDetent("half")} aria-hidden="true" data-testid="bottomsheet-scrim" />
      <section className={s.sheet} role="region" aria-label={label} data-detent={detent}
        style={{ height: h, bottom, transition: drag !== null ? "none" : undefined }} {...rest}>
        <div className={s.head} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <button type="button" className={s.grab} data-grab aria-label={detent === "full" ? "少しだけにする" : "広げる"}
            onClick={(e) => { if (e.detail === 0) onDetent(DETENTS[(DETENTS.indexOf(detent) + 1) % DETENTS.length]!); }} />
          {header}
        </div>
        <div className={s.body}>{children}</div>
      </section>
    </>
  );
}
