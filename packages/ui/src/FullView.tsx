// 全面で開く（ラボを広く使う・別の画面に出さない）。押した所から少し拡大して現れ、✕ か Esc で元の画面に戻る。
// 新しいタブに出すと iPhone では戻り方が分からなくなるので、同じ画面の上に重ねる。動きを減らす設定では、その場で出る。
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { reduced, tokenMs } from "./motion";
import s from "./FullView.module.css";

type Props = { title: ReactNode; label: string; onClose: () => void; children: ReactNode; aside?: ReactNode };

export function FullView({ title, label, onClose, children, aside }: Props) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    if (reduced()) { onClose(); return; }
    setClosing(true);
    setTimeout(onClose, tokenMs("--dur", 200));
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", k);
    const html = document.documentElement, before = html.style.overflow;
    html.style.overflow = "hidden";   // 後ろの画面は動かさない
    return () => { removeEventListener("keydown", k); html.style.overflow = before; };
  });
  return createPortal(
    <div className={`${s.root}${closing ? ` ${s.closing}` : ""}`} role="dialog" aria-modal="true" aria-label={label} data-testid="fullview">
      <header className={s.bar}>
        <button type="button" className={s.close} onClick={close} aria-label="閉じて戻る">✕</button>
        <div className={s.title}>{title}</div>
        <div className={s.aside}>{aside}</div>
      </header>
      <div className={s.body}>{children}</div>
    </div>,
    document.body,
  );
}
