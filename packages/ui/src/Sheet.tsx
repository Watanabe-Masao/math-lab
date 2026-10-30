// 下から開く面（iPhone のアプリのシートの手触り。#42）
// - 上のつまみ（と見出しの行）を指でつかんで動かせる。上へ引くと全体に広がり、下へ払うと閉じる。離すと近い段（半分・全体）へすっと止まる
// - つまみを押すと 半分 ⇄ 全体 を切り替える。全体のときは後ろを暗くし、暗い所を押すと半分に戻る
// - 半分のときは後ろ（図）も触れる。閉じるは左上の丸い × か、下へ払う
// - 動きを減らす設定では、すっと動かず段に切り替わるだけ（base.css）
import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent as RPE, type ReactNode } from "react";
import s from "./Sheet.module.css";

type Props = { label: string; title: ReactNode; onClose: () => void; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "title">;

const vh = () => (typeof window === "undefined" ? 800 : window.innerHeight);
export const HALF = 0.55;
const fullH = () => vh() - 40;
const halfH = () => Math.round(vh() * HALF);

export function Sheet({ label, title, onClose, children, ...rest }: Props) {
  const [full, setFull] = useState(false);
  const [drag, setDrag] = useState<{ h: number; down: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const g = useRef<{ y0: number; h0: number; t: number; y: number; v: number; moved: boolean; grab: boolean } | null>(null);

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); });

  function close() {
    if (closing) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onClose(); return; }
    setClosing(true);
    setTimeout(onClose, parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur")) || 200);
  }

  const onDown = (e: RPE) => {
    if ((e.target as HTMLElement).closest("button:not([data-grab])")) return;
    g.current = { y0: e.clientY, h0: full ? fullH() : halfH(), t: e.timeStamp, y: e.clientY, v: 0, moved: false, grab: !!(e.target as HTMLElement).closest("[data-grab]") };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPE) => {
    const d = g.current; if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = (e.clientY - d.y) / dt; d.t = e.timeStamp; d.y = e.clientY;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 4) d.moved = true;
    let h = d.h0 - dy;
    const top = fullH();
    if (h > top) h = top + (h - top) * 0.2;               // 上の端はゴムのように少しだけ伸びる
    const min = halfH();
    setDrag(h >= min ? { h, down: 0 } : { h: min, down: min - h });   // 半分より下は面ごと下へずらす
  };
  const onUp = (e: RPE) => {
    const d = g.current; g.current = null; if (!d) return;
    if (!d.moved) { if (d.grab) setFull((f) => !f); setDrag(null); return; }   // つまみを押しただけなら段を切り替える（指を捕まえているので e.target は見ない）
    const h = d.h0 - (e.clientY - d.y0), v = d.v;      // v：下向きが＋（px/ms）
    setDrag(null);
    if (h < halfH() * 0.7 || (v > 0.6 && h < halfH() + 40)) { close(); return; }
    if (v < -0.3) setFull(true);
    else if (v > 0.3) setFull(false);
    else setFull(h > (halfH() + fullH()) / 2);
  };

  const h = drag ? drag.h : full ? fullH() : halfH();
  const style = { height: h, transform: closing ? "translateY(100%)" : drag?.down ? `translateY(${drag.down}px)` : undefined, transition: drag ? "none" : undefined };
  return (
    <>
      <div className={`${s.scrim}${full && !closing ? ` ${s.on}` : ""}`} onClick={() => setFull(false)} aria-hidden="true" data-testid="sheet-scrim" />
      <aside className={s.sheet} role="dialog" aria-label={label} data-detent={full ? "full" : "half"} style={style} {...rest}>
        <div className={s.head} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <button type="button" className={s.grab} data-grab onClick={(e) => { if (e.detail === 0) setFull((f) => !f); }} aria-label={full ? "半分にする" : "全体に広げる"} />
          <div className={s.bar}>
            <button type="button" className={s.close} onClick={close} aria-label="説明を閉じる">✕</button>
            <div className={s.title}>{title}</div>
            <span className={s.spacer} />
          </div>
        </div>
        <div className={s.body}>{children}</div>
      </aside>
    </>
  );
}
