// 図を大きく見る（拡大）：押した小さな図の位置から、画面いっぱいへ広がる。どこを押しても元の位置へ縮んで閉じる。
// 動きを減らす設定では、広がらずにその場で出る・消える。
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reduced, tokenMs } from "./motion";
import s from "./Lightbox.module.css";

type Props = { src: string; alt: string; caption?: string; href?: string; from?: DOMRect | null; onClose: () => void };

export function Lightbox({ src, alt, caption, href, from, onClose }: Props) {
  const img = useRef<HTMLImageElement>(null);
  const [closing, setClosing] = useState(false);
  // 開く：最後の位置（中央）から、押した図の位置へ戻した形を最初の枠にして広げる（FLIP）
  const flip = (el: HTMLElement, reverse: boolean) => {
    if (!from || reduced() || !el.animate) return null;
    const to = el.getBoundingClientRect();
    const k = from.width / Math.max(1, to.width);
    const start = `translate(${from.left - to.left + (from.width - to.width) / 2}px, ${from.top - to.top + (from.height - to.height) / 2}px) scale(${k})`;
    const frames = [{ transform: start }, { transform: "none" }];
    return el.animate(reverse ? frames.reverse() : frames, { duration: tokenMs("--dur-sheet", 320), easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" });
  };
  useLayoutEffect(() => { if (img.current) flip(img.current, false); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (closing) return;
    setClosing(true);
    const a = img.current && flip(img.current, true);
    if (a) a.finished.then(onClose, onClose); else onClose();
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); });
  return createPortal(   // シートの中（transform のある面）からでも画面全体に出す
    <div className={`${s.root}${closing ? ` ${s.closing}` : ""}`} role="dialog" aria-modal="true" aria-label={alt} onClick={close} data-testid="lightbox">
      <figure className={s.fig}>
        <img ref={img} src={src} alt={alt} className={s.img} />
        {(caption || href) && (
          <figcaption className={s.cap} onClick={(e) => e.stopPropagation()}>
            {caption}
            {href && <a href={href} target="_blank" rel="noreferrer" className={s.link}>別の画面で開く ↗</a>}
          </figcaption>
        )}
      </figure>
      <button type="button" className={s.close} onClick={(e) => { e.stopPropagation(); close(); }} aria-label="閉じる">✕</button>
    </div>,
    document.body,
  );
}
