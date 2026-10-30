// 式の木から TeX を作る（#72）。括弧は演算の強さから付ける（手で書かない）。
// 記号は symbols の symbol（μ・σ・A∩B など）を TeX にして使う。wrap を渡すと、記号ごとに印を付けられる
// （画面で「押すと意味・今の値・概念が出る」ために \htmlData{sym=…}{…} で包む。KaTeX は trust が要る）。
import { isNum, isSym, type FormulaNode, type FormulaSymbol, type OpNode } from "./types";

export type TexOptions = {
  symbols?: FormulaSymbol[];
  /** 記号の TeX を包む（key と、包む前の TeX を受け取る） */
  wrap?: (key: string, tex: string) => string;
  /** 節に印を付ける（開いた所など。返した名前で \\htmlData{open=名前}{…} に包む） */
  mark?: (node: FormulaNode) => string | undefined;
  /** 数の書き方（既定：小数10桁までで丸め、末尾の0を落とす） */
  num?: (v: number) => string;
};

const GREEK: Record<string, string> = {
  α: "\\alpha", β: "\\beta", γ: "\\gamma", δ: "\\delta", ε: "\\varepsilon", θ: "\\theta", λ: "\\lambda", μ: "\\mu", ν: "\\nu",
  π: "\\pi", ρ: "\\rho", σ: "\\sigma", τ: "\\tau", φ: "\\varphi", χ: "\\chi", ω: "\\omega", Σ: "\\Sigma", Φ: "\\Phi", Ω: "\\Omega",
  "∩": "\\cap ", "∪": "\\cup ", "−": "-",
};
const NAMES: Record<string, string> = Object.fromEntries(Object.entries(GREEK).filter(([k]) => /\p{L}/u.test(k)).map(([k, v]) => [v.slice(1).replace("var", ""), v]));

/** 表示の記号（μ_X・A∩B・σ）を TeX に。symbols にない key は、ギリシャ文字の名前（mu・lambda）か、そのまま。 */
export function symbolTex(key: string, symbols: FormulaSymbol[] = []): string {
  const s = symbols.find((x) => x.key === key && !/[()]/.test(x.symbol))?.symbol;
  if (s) {
    // 1字ずつ TeX に。命令（\mu など）のすぐあとに文字が続くときだけ空白を入れる（\mu X が \muX にならないように）
    let out = "";
    for (const c of s) { const t = GREEK[c] ?? c; out += /\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(t) ? ` ${t}` : t; }
    return out;
  }
  const m = /^([a-z]+)([A-Z0-9]*)$/.exec(key);
  if (m && NAMES[m[1]!]) return NAMES[m[1]!] + (m[2] ? `_{${m[2]}}` : "");
  return key.length > 1 && /^[A-Za-z]+$/.test(key) ? `\\mathrm{${key}}` : key;
}

export function formatNum(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "\\infty" : v < 0 ? "-\\infty" : "\\mathrm{NaN}";
  const s = String(Number(v.toPrecision(10)));
  return s.includes("e") ? v.toExponential(4).replace(/e\+?(-?)(\d+)/, "\\times 10^{$1$2}") : s;
}

// 強さ：比べる・等しい 0 ＜ 足す・引く 1 ＜ 掛ける・割る・符号 2 ＜ 累乗 3 ＜ 1つのかたまり 4
type Out = { t: string; p: number; num?: boolean; neg?: boolean; fn?: boolean };

const ATOM = 4;
// 括弧：中身が高い（分数・Σ・∫・根号）ときだけ \left( \right) で伸ばす。ふつうは ( ) のまま（E\left(X\right) は E と ( の間が空いて見える）
const TALL = /\\(dfrac|sum|prod|int|sqrt)/;
const wrapParen = (t: string) => (TALL.test(t) ? `\\left(${t}\\right)` : `(${t})`);
const paren = (o: Out, need: boolean) => (need ? wrapParen(o.t) : o.t);

export function toTex(node: FormulaNode, opt: TexOptions = {}): string {
  const fmt = opt.num ?? formatNum;
  const sym = (k: string) => { const t = symbolTex(k, opt.symbols); return opt.wrap ? opt.wrap(k, t) : t; };

  const go = (n: FormulaNode): Out => {
    const o: Out = isSym(n) ? { t: sym(n.sym), p: ATOM } : isNum(n) ? (n.num < 0 ? { t: fmt(n.num), p: 2, num: true, neg: true } : { t: fmt(n.num), p: ATOM, num: true }) : opNode(n);
    const m = opt.mark?.(n);
    return m ? { ...o, t: `\\htmlData{open=${m}}{${o.t}}` } : o;
  };

  const opNode = (n: OpNode): Out => {
    const a = n.args.map(go);
    switch (n.op) {
      case "eq": return { t: a.map((x) => x.t).join("="), p: 0 };
      case "add": return { t: a.map((x, i) => i === 0 ? paren(x, x.p < 1) : x.neg && !x.num ? x.t : `+${paren(x, x.p < 1 || !!x.neg)}`).join(""), p: 1 };
      case "sub": return { t: a.map((x, i) => i === 0 ? paren(x, x.p < 1) : `-${paren(x, x.p <= 1 || !!x.neg)}`).join(""), p: 1 };
      case "mul": {
        let t = "";
        a.forEach((x, i) => {
          const part = paren(x, x.p < 2 || (i > 0 && !!x.neg));
          if (i > 0) {
            const prev = a[i - 1]!;
            // 数のあとの数・括弧・分数、数字どうしが続く所は × を書く（2X・np はそのまま）
            const times = x.num || /\d$/.test(t) && /^[\d.]/.test(part) || (prev.num && /^(\\left|\\dfrac|\()/.test(part));
            t += times ? "\\times " : prev.fn && x.fn ? "\\," : /\\[A-Za-z]+$/.test(t) && /^[A-Za-z]/.test(part) ? " " : "";   // \lambda e が \lambdae にならないように
          }
          t += part;
        });
        return { t, p: 2, neg: !!a[0]?.neg };
      }
      case "div": return { t: `\\dfrac{${a[0]!.t}}{${a[1]!.t}}`, p: ATOM };
      case "neg": return { t: `-${paren(a[0]!, a[0]!.p < 2 || !!a[0]!.neg)}`, p: 2, neg: true };   // −λx はそのまま、−(a+b) と −(−a) だけ括弧
      case "pow": return { t: `${paren(a[0]!, a[0]!.p < ATOM || !!a[0]!.neg || /^\\dfrac/.test(a[0]!.t) || !!a[0]!.fn)}^{${a[1]!.t}}`, p: 3 };
      case "sqrt": return { t: `\\sqrt{${a[0]!.t}}`, p: ATOM };
      case "abs": return { t: `\\left|${a[0]!.t}\\right|`, p: ATOM };
      case "sum": case "prod": {
        const big = n.op === "sum" ? "\\sum" : "\\prod";
        const v = n.var ? sym(n.var) : "";
        const sub = n.lower ? `${v}=${go(n.lower).t}` : v;
        const sup = n.upper ? `^{${go(n.upper).t}}` : "";
        return { t: `${big}_{${sub}}${sup}${paren(a[0]!, a[0]!.p < 2)}`, p: 2 };
      }
      case "int": {
        const lo = n.lower ? go(n.lower).t : "-\\infty", hi = n.upper ? go(n.upper).t : "\\infty";
        return { t: `\\int_{${lo}}^{${hi}}${paren(a[0]!, a[0]!.p < 2)}\\,d${n.var ? sym(n.var) : "x"}`, p: 2 };
      }
      case "fn": return fn(n.name ?? "f", a);
    }
  };

  const fn = (name: string, a: Out[]): Out => {
    const list = a.map((x) => x.t).join(",\\,");
    switch (name) {
      case "comb": return { t: `{}_{${a[0]!.t}}\\mathrm{C}_{${a[1]!.t}}`, p: ATOM, fn: true };
      case "fact": return { t: `${paren(a[0]!, a[0]!.p < ATOM || !!a[0]!.neg)}!`, p: ATOM };
      case "gt": return { t: `${a[0]!.t}>${a[1]!.t}`, p: 0 };
      case "ge": return { t: `${a[0]!.t}\\ge ${a[1]!.t}`, p: 0 };
      case "lt": return { t: `${a[0]!.t}<${a[1]!.t}`, p: 0 };
      case "le": return { t: `${a[0]!.t}\\le ${a[1]!.t}`, p: 0 };
      case "between": return { t: `${a[0]!.t}\\le ${a[1]!.t}\\le ${a[2]!.t}`, p: 0 };
      case "exp": case "log": return { t: `\\${name}${wrapParen(list)}`, p: ATOM, fn: true };
      default: {
        const head = name.length > 1 ? `\\mathrm{${name}}` : name;
        return { t: `${opt.wrap ? opt.wrap(name, head) : head}${wrapParen(list)}`, p: ATOM, fn: true };
      }
    }
  };

  return go(node).t;
}
