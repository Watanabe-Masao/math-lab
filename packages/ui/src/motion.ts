// 手触り（#42）：動きは「何が変わったか」を伝えるためだけに使う。1つの操作に動きは1つ。
// - 押した返事（沈む）は CSS（Button・Segmented の :active）
// - 切り替え・前後の図は change()：変わる所だけを View Transitions でつなぐ（使えない環境・動きを減らす設定では、すぐ変える）
// - 結果が出た所は flash()：一度だけ淡く光らせる
// - 触覚は haptic()：iPhone の Safari で、スイッチ（<input switch>）を押したときの振動を借りる試み。出ない環境では何もしない
import { flushSync } from "react-dom";

export const reduced = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/** el の中身を update で変え、前後を短くつなぐ。el に一時だけ名前を付けるので、同じ画面に何個あっても重ならない。 */
export function change(el: HTMLElement | null, update: () => void): void {
  const doc = document as VTDoc;
  if (!el || !doc.startViewTransition || reduced()) { update(); return; }
  el.style.setProperty("view-transition-name", "kn-change");
  const t = doc.startViewTransition(() => flushSync(update));
  t.finished.finally(() => el.style.removeProperty("view-transition-name"));
}

/** 結果が出た所を一度だけ淡く光らせる（--flash の色・--dur-flash の長さ）。 */
export function flash(el: Element | null): void {
  if (!el || reduced() || !("animate" in el)) return;
  const css = getComputedStyle(document.documentElement);
  const ms = parseFloat(css.getPropertyValue("--dur-flash")) || 700;
  (el as HTMLElement).animate([{ backgroundColor: css.getPropertyValue("--flash").trim() || "transparent" }, { backgroundColor: "transparent" }], { duration: ms, easing: "ease-out" });
}

let sw: HTMLLabelElement | null = null;
/** iPhone で軽く振動させる（試み）。押す操作の中で呼ぶ。 */
export function haptic(): void {
  if (typeof navigator === "undefined" || !/iP(hone|ad|od)/.test(navigator.userAgent)) return;
  if (!sw) {
    sw = document.createElement("label");
    sw.setAttribute("aria-hidden", "true");
    sw.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    sw.appendChild(input);
    document.body.appendChild(sw);
  }
  sw.click();
}

// iPhone の Safari は、touchstart を聞いていないと :active（押した返事）を出さない
if (typeof document !== "undefined") document.addEventListener("touchstart", () => {}, { passive: true });
