// 生成物：packages/engine/src/formula から scripts/bundle-formula.mjs で作る。手で直さない（npm run bundle）
// packages/engine/src/formula/types.ts
const isSym = (n) => "sym" in n;
const isNum = (n) => "num" in n;
const isOp = (n) => "op" in n;
/** 記号に書かなくてよい共通の関数（それ以外の fn の name は、その式の symbols の key） */
const COMMON_FNS = [
	"exp",
	"log",
	"gt",
	"ge",
	"lt",
	"le",
	"between"
];
// packages/engine/src/formula/tex.ts
const GREEK = {
	α: "\\alpha",
	β: "\\beta",
	γ: "\\gamma",
	δ: "\\delta",
	ε: "\\varepsilon",
	θ: "\\theta",
	λ: "\\lambda",
	μ: "\\mu",
	ν: "\\nu",
	π: "\\pi",
	ρ: "\\rho",
	σ: "\\sigma",
	τ: "\\tau",
	φ: "\\varphi",
	χ: "\\chi",
	ω: "\\omega",
	Σ: "\\Sigma",
	Φ: "\\Phi",
	Ω: "\\Omega",
	"∩": "\\cap ",
	"∪": "\\cup ",
	"−": "-"
};
const NAMES = Object.fromEntries(Object.entries(GREEK).filter(([k]) => /\p{L}/u.test(k)).map(([k, v]) => [v.slice(1).replace("var", ""), v]));
/** 表示の記号（μ_X・A∩B・σ）を TeX に。symbols にない key は、ギリシャ文字の名前（mu・lambda）か、そのまま。 */
function symbolTex(key, symbols = []) {
	const s = symbols.find((x) => x.key === key && !/[()]/.test(x.symbol))?.symbol;
	if (s) {
		let out = "";
		for (const c of s) {
			const t = GREEK[c] ?? c;
			out += /\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(t) ? ` ${t}` : t;
		}
		return out;
	}
	const m = /^([a-z]+)([A-Z0-9]*)$/.exec(key);
	if (m && NAMES[m[1]]) return NAMES[m[1]] + (m[2] ? `_{${m[2]}}` : "");
	return key.length > 1 && /^[A-Za-z]+$/.test(key) ? `\\mathrm{${key}}` : key;
}
function formatNum(v) {
	if (!Number.isFinite(v)) return v > 0 ? "\\infty" : v < 0 ? "-\\infty" : "\\mathrm{NaN}";
	const s = String(Number(v.toPrecision(10)));
	return s.includes("e") ? v.toExponential(4).replace(/e\+?(-?)(\d+)/, "\\times 10^{$1$2}") : s;
}
const ATOM = 4;
const TALL = /\\(dfrac|sum|prod|int|sqrt)/;
const wrapParen = (t) => TALL.test(t) ? `\\left(${t}\\right)` : `(${t})`;
const paren = (o, need) => need ? wrapParen(o.t) : o.t;
const numericTree = (n) => isNum(n) || !isSym(n) && n.args.every(numericTree);
function toTex(node, opt = {}) {
	const fmt = opt.num ?? formatNum;
	const sym = (k) => {
		const t = symbolTex(k, opt.symbols);
		return opt.wrap ? opt.wrap(k, t) : t;
	};
	const go = (n) => {
		const o = isSym(n) ? {
			t: sym(n.sym),
			p: ATOM
		} : isNum(n) ? n.num < 0 ? {
			t: fmt(n.num),
			p: 2,
			num: true,
			neg: true
		} : {
			t: fmt(n.num),
			p: ATOM,
			num: true
		} : opNode(n);
		o.numeric = isNum(n) || !isSym(n) && n.args.every((a) => isNum(a) || !isSym(a) && numericTree(a));
		const m = opt.mark?.(n), d = opt.data?.(n);
		let t = m ? `\\htmlData{open=${m}}{${o.t}}` : o.t;
		if (d) t = `\\htmlData{${d}}{${t}}`;
		return t === o.t ? o : {
			...o,
			t
		};
	};
	const opNode = (n) => {
		const a = n.args.map(go);
		switch (n.op) {
			case "eq": return {
				t: a.map((x) => x.t).join("="),
				p: 0
			};
			case "add": return {
				t: a.map((x, i) => i === 0 ? paren(x, x.p < 1) : x.neg && !x.num ? x.t : `+${paren(x, x.p < 1 || !!x.neg)}`).join(""),
				p: 1
			};
			case "sub": return {
				t: a.map((x, i) => i === 0 ? paren(x, x.p < 1) : `-${paren(x, x.p <= 1 || !!x.neg)}`).join(""),
				p: 1
			};
			case "mul": {
				let t = "";
				a.forEach((x, i) => {
					const part = paren(x, x.p < 2 || i > 0 && !!x.neg || !!x.big && i < a.length - 1);
					if (i > 0) {
						const prev = a[i - 1];
						const times = x.num || /^[\d.]/.test(part) || prev.numeric && x.numeric || prev.num && /^(\\left|\\dfrac|\()/.test(part);
						t += times ? "\\times " : prev.fn && x.fn ? "\\," : /\\[A-Za-z]+$/.test(t) && /^[A-Za-z]/.test(part) ? " " : "";
					}
					t += part;
				});
				return {
					t,
					p: 2,
					neg: !!a[0]?.neg
				};
			}
			case "div": return {
				t: `\\dfrac{${a[0].t}}{${a[1].t}}`,
				p: ATOM
			};
			case "neg": return {
				t: `-${paren(a[0], a[0].p < 2 || !!a[0].neg)}`,
				p: 2,
				neg: true
			};
			case "pow": return {
				t: `${paren(a[0], a[0].p < ATOM || !!a[0].neg || /^\\dfrac/.test(a[0].t) || !!a[0].fn)}^{${a[1].t}}`,
				p: 3
			};
			case "sqrt": return {
				t: `\\sqrt{${a[0].t}}`,
				p: ATOM
			};
			case "abs": return {
				t: `\\left|${a[0].t}\\right|`,
				p: ATOM
			};
			case "sum":
			case "prod": {
				const big = n.op === "sum" ? "\\sum" : "\\prod";
				const v = n.var ? sym(n.var) : "";
				return {
					t: `${big}_{${n.lower ? `${v}=${go(n.lower).t}` : v}}${n.upper ? `^{${go(n.upper).t}}` : ""}${paren(a[0], a[0].p < 2)}`,
					p: 2,
					big: true
				};
			}
			case "int": return {
				t: `\\int_{${n.lower ? go(n.lower).t : "-\\infty"}}^{${n.upper ? go(n.upper).t : "\\infty"}}${paren(a[0], a[0].p < 2)}\\,d${n.var ? sym(n.var) : "x"}`,
				p: 2
			};
			case "fn": return fn(n.name ?? "f", a);
		}
	};
	const fn = (name, a) => {
		const list = a.map((x) => x.t).join(",\\,");
		switch (name) {
			case "comb": return {
				t: `{}_{${a[0].t}}\\mathrm{C}_{${a[1].t}}`,
				p: ATOM,
				fn: true
			};
			case "fact": return {
				t: `${paren(a[0], a[0].p < ATOM || !!a[0].neg)}!`,
				p: ATOM
			};
			case "gt": return {
				t: `${a[0].t}>${a[1].t}`,
				p: 0
			};
			case "ge": return {
				t: `${a[0].t}\\ge ${a[1].t}`,
				p: 0
			};
			case "lt": return {
				t: `${a[0].t}<${a[1].t}`,
				p: 0
			};
			case "le": return {
				t: `${a[0].t}\\le ${a[1].t}`,
				p: 0
			};
			case "between": return {
				t: `${a[0].t}\\le ${a[1].t}\\le ${a[2].t}`,
				p: 0
			};
			case "exp":
			case "log": return {
				t: `\\${name}${wrapParen(list)}`,
				p: ATOM,
				fn: true
			};
			default: {
				const head = name.length > 1 ? `\\mathrm{${name}}` : name;
				return {
					t: `${opt.wrap ? opt.wrap(name, head) : head}${wrapParen(list)}`,
					p: ATOM,
					fn: true
				};
			}
		}
	};
	return go(node).t;
}
// packages/engine/src/formula/scope.ts
/** 自由な記号（縛られていない記号の葉）。関数の名前は入れない */
function freeSymbols(node, bound = /* @__PURE__ */ new Set()) {
	const out = /* @__PURE__ */ new Set();
	const walk = (n, b) => {
		if (isSym(n)) {
			if (!b.has(n.sym)) out.add(n.sym);
			return;
		}
		if (isNum(n)) return;
		if (n.lower) walk(n.lower, b);
		if (n.upper) walk(n.upper, b);
		const inner = n.var ? /* @__PURE__ */ new Set([...b, n.var]) : b;
		n.args.forEach((a) => walk(a, inner));
	};
	walk(node, bound);
	return out;
}
/** 木の中で縛る記号（var）の一覧 */
function boundSymbols(node) {
	const out = /* @__PURE__ */ new Set();
	const walk = (n) => {
		if (isSym(n) || isNum(n)) return;
		if (n.var) out.add(n.var);
		n.args.forEach(walk);
		if (n.lower) walk(n.lower);
		if (n.upper) walk(n.upper);
	};
	walk(node);
	return out;
}
/** 縛られた記号 from を to に付け替える（その Σ・∫ の中だけ。中でさらに同じ名前で縛られていればそこは変えない） */
function renameBound(node, from, to) {
	const sub = (n) => {
		if (isSym(n)) return n.sym === from ? { sym: to } : n;
		if (isNum(n)) return n;
		if (n.var === from) return n;
		return {
			...n,
			args: n.args.map(sub),
			...n.lower ? { lower: sub(n.lower) } : {},
			...n.upper ? { upper: sub(n.upper) } : {}
		};
	};
	const walk = (n) => {
		if (isSym(n) || isNum(n)) return n;
		if (n.var === from) {
			const out = {
				...n,
				var: to,
				args: n.args.map(sub)
			};
			if (n.lower) out.lower = walk(n.lower);
			if (n.upper) out.upper = walk(n.upper);
			return out;
		}
		return {
			...n,
			args: n.args.map(walk),
			...n.lower ? { lower: walk(n.lower) } : {},
			...n.upper ? { upper: walk(n.upper) } : {}
		};
	};
	return walk(node);
}
/** used にない新しい名前（x → x2 → x3 …） */
function freshName(base, used) {
	for (let i = 2;; i++) {
		const k = `${base}${i}`;
		if (!used.has(k)) return k;
	}
}
/**
* 自由な記号の葉だけを置き換える（記号の有効な範囲を守る1つの決まり。stats2-course #142）。
* Σ・Π・∫ の動かす記号（var）は中身（args）では縛られていて、置き換えない。端（lower・upper）は外側の記号なので置き換える。
* 値を入れる（substitute）・動かす記号に1つずつ値を入れる（Σ を項に開く）・記号を式で開く（substituteFree）は、どれもこれを使う。
* f が undefined を返す記号はそのまま残す。
*/
function replaceFree(node, f, bound = /* @__PURE__ */ new Set()) {
	if (isSym(node)) return bound.has(node.sym) ? node : f(node.sym) ?? node;
	if (isNum(node)) return node;
	const inner = node.var ? /* @__PURE__ */ new Set([...bound, node.var]) : bound;
	const out = {
		...node,
		args: node.args.map((a) => replaceFree(a, f, inner))
	};
	if (node.lower) out.lower = replaceFree(node.lower, f, bound);
	if (node.upper) out.upper = replaceFree(node.upper, f, bound);
	return out;
}
// packages/engine/src/formula/evaluate.ts
const CONST = {
	e: Math.E,
	pi: Math.PI
};
function factorial(n) {
	if (!Number.isInteger(n) || n < 0) return NaN;
	let r = 1;
	for (let i = 2; i <= n; i++) r *= i;
	return r;
}
function comb(n, k) {
	if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) return NaN;
	if (k < 0 || k > n) return 0;
	let r = 1;
	for (let i = 1; i <= Math.min(k, n - k); i++) r = r * (n - i + 1) / i;
	return Math.round(r);
}
const BUILTIN = {
	comb,
	fact: factorial,
	exp: Math.exp,
	log: Math.log,
	gt: (a, b) => +(a > b),
	ge: (a, b) => +(a >= b),
	lt: (a, b) => +(a < b),
	le: (a, b) => +(a <= b),
	between: (x, a, b) => +(a <= x && x <= b)
};
/** 1つの演算を、引数の値から計算する（計算できなければ undefined） */
function apply(n, v, env) {
	switch (n.op) {
		case "add": return v.reduce((s, x) => s + x, 0);
		case "sub": return v.slice(1).reduce((s, x) => s - x, v[0]);
		case "mul": return v.reduce((s, x) => s * x, 1);
		case "div": return v[0] / v[1];
		case "pow": return v[0] ** v[1];
		case "neg": return -v[0];
		case "sqrt": return Math.sqrt(v[0]);
		case "abs": return Math.abs(v[0]);
		case "fn": {
			const f = env.fns?.[n.name ?? ""] ?? BUILTIN[n.name ?? ""];
			return f ? f(...v) : void 0;
		}
		default: return;
	}
}
function symValue(k, env) {
	return env.values?.[k] ?? CONST[k];
}
/** Σ・Π の項の数の上限（これを超えるときは値にしない） */
const MAX_TERMS = 1e4;
/** Σ・Π：下端・上端が整数の値になれば、動かす記号に1つずつ入れて足す・掛ける（空なら 0・1）。∫ は値にしない */
/** Σ・Π の動かす記号がとる値：端が整数ならその範囲、端がなければ domains の一覧（どちらもなければ undefined） */
function rangeOf(node, env) {
	if (!node.var) return void 0;
	if (!node.lower && !node.upper) {
		const d = env.domains?.[node.var];
		return d && d.length <= MAX_TERMS ? d : void 0;
	}
	if (!node.lower || !node.upper) return void 0;
	const lo = evaluate(node.lower, env), hi = evaluate(node.upper, env);
	if (lo === void 0 || hi === void 0 || !Number.isInteger(lo) || !Number.isInteger(hi) || hi - lo + 1 > MAX_TERMS) return void 0;
	return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
}
function bigOp(node, env) {
	if (node.op !== "sum" && node.op !== "prod") return void 0;
	const xs = rangeOf(node, env);
	if (!xs) return void 0;
	let r = node.op === "sum" ? 0 : 1;
	for (const i of xs) {
		const x = evaluate(node.args[0], {
			...env,
			values: {
				...env.values,
				[node.var]: i
			}
		});
		if (x === void 0) return void 0;
		r = node.op === "sum" ? r + x : r * x;
	}
	return r;
}
/** 動かす記号 v（Σ の中だけで使う記号）に値を入れる（内側で同じ記号を縛る Σ の中は入れない。決まりは replaceFree の1か所） */
function substituteVar(node, v, x) {
	return replaceFree(node, (k) => k === v ? { num: x } : void 0);
}
/** 値を求める（記号の値・関数がそろわない、または eq・∫ を含むときは undefined。Σ・Π は範囲が決まれば求める） */
function evaluate(node, env = {}) {
	if (isNum(node)) return node.num;
	if (isSym(node)) return symValue(node.sym, env);
	if (node.op === "sum" || node.op === "prod") return bigOp(node, env);
	const v = [];
	for (const a of node.args) {
		const x = evaluate(a, env);
		if (x === void 0) return void 0;
		v.push(x);
	}
	return apply(node, v, env);
}
/** 記号に値を入れた木（値のない記号はそのまま。e・π は記号のまま残す）。
*  Σ・Π・∫ の動かす記号は、その中では外の同じ名前の値で置き換えない（#142：Σ_{x=1}^{3} x を x＝10 で 30 にしていた）。決まりは replaceFree の1か所 */
function substitute(node, env) {
	return replaceFree(node, (k) => {
		const x = env.values?.[k];
		return x === void 0 ? void 0 : { num: x };
	});
}
/** 引数がすべて数になった演算を、1段だけ計算する（同じ深さのものはいっしょに）。変わらなければ同じ木を返す */
function stepOnce(node, env) {
	if (!isOp(node)) return node;
	if (node.op === "sum" && node.var && !node.lower && !node.upper && env.domains?.[node.var] && env.domains[node.var].length <= 12) {
		const terms = env.domains[node.var].map((x) => substituteVar(node.args[0], node.var, x));
		return terms.length === 0 ? { num: 0 } : terms.length === 1 ? terms[0] : {
			op: "add",
			args: terms
		};
	}
	if ((node.op === "sum" || node.op === "prod") && (node.lower && node.upper && isNum(node.lower) && isNum(node.upper) || !node.lower && !node.upper && node.var && env.domains?.[node.var])) {
		const r = bigOp(node, {
			fns: env.fns,
			domains: env.domains
		});
		if (r !== void 0 && Number.isFinite(r)) return { num: r };
	}
	if (node.args.every((a) => isNum(a) || isSym(a) && CONST[a.sym] !== void 0 && node.op !== "eq") && node.op !== "eq") {
		const r = apply(node, node.args.map((a) => isNum(a) ? a.num : CONST[a.sym]), env);
		if (r !== void 0 && Number.isFinite(r)) return { num: r };
	}
	const args = node.args.map((a) => stepOnce(a, env));
	const lower = node.lower && stepOnce(node.lower, env), upper = node.upper && stepOnce(node.upper, env);
	if (args.every((a, i) => a === node.args[i]) && lower === node.lower && upper === node.upper) return node;
	const out = {
		...node,
		args
	};
	if (lower) out.lower = lower;
	if (upper) out.upper = upper;
	return out;
}
/**
* 1段ずつの展開：[元の式, 記号に値を入れた式, 1段計算した式, …, これ以上計算できない式]。
* 等しい（eq）の式は、最後の辺（右辺）を展開する。左辺は画面で「E(X) ＝」のように前に置く。
*/
function expand(node, env = {}) {
	const target = isOp(node) && node.op === "eq" ? node.args[node.args.length - 1] : node;
	const steps = [target];
	let cur = substitute(target, env);
	if (JSON.stringify(cur) !== JSON.stringify(target)) steps.push(cur);
	for (let i = 0; i < 100; i++) {
		const next = stepOnce(cur, env);
		if (next === cur) break;
		steps.push(next);
		cur = next;
	}
	return steps;
}
/** 木の中の関数の名前（出てくる順・重なりなし。comb・fact・E など） */
function fnsIn(node) {
	const out = [];
	const walk = (n) => {
		if (!isOp(n)) return;
		if (n.op === "fn" && n.name && !out.includes(n.name)) out.push(n.name);
		n.args.forEach(walk);
		if (n.lower) walk(n.lower);
		if (n.upper) walk(n.upper);
	};
	walk(node);
	return out;
}
/** 木の中の記号の key（出てくる順・重なりなし。関数の名前は入れない） */
function symbolsIn(node) {
	const out = [];
	const walk = (n) => {
		if (isSym(n)) {
			if (!out.includes(n.sym)) out.push(n.sym);
			return;
		}
		if (isNum(n)) return;
		if (n.var && !out.includes(n.var)) out.push(n.var);
		n.args.forEach(walk);
		if (n.lower) walk(n.lower);
		if (n.upper) walk(n.upper);
	};
	walk(node);
	return out;
}
// packages/engine/src/formula/validate.ts
const ARITY = {
	div: 2,
	pow: 2,
	neg: 1,
	sqrt: 1,
	abs: 1,
	sum: 1,
	prod: 1,
	int: 1
};
function validateFormula(f) {
	const keys = new Set(f.symbols.map((s) => s.key));
	const bad = [];
	const walk = (n, bound) => {
		if (isNum(n)) {
			if (!Number.isFinite(n.num)) bad.push(`数が有限でない：${n.num}`);
			return;
		}
		if (isSym(n)) {
			if (!keys.has(n.sym) && !bound.has(n.sym)) bad.push(`記号 ${n.sym} が symbols にない`);
			return;
		}
		const want = ARITY[n.op];
		if (want !== void 0 && n.args.length !== want) bad.push(`${n.op} の引数は ${want} 個（今 ${n.args.length}）`);
		if ((n.op === "eq" || n.op === "sub") && n.args.length < 2) bad.push(`${n.op} の引数は2個以上`);
		if (n.op === "fn" && !(n.name && (keys.has(n.name) || COMMON_FNS.includes(n.name)))) bad.push(`関数 ${n.name ?? "（名前なし）"} が symbols にも共通の関数にもない`);
		if (n.var && !keys.has(n.var)) bad.push(`動かす記号 ${n.var} が symbols にない`);
		const b = n.var ? /* @__PURE__ */ new Set([...bound, n.var]) : bound;
		n.args.forEach((a) => walk(a, b));
		if (n.lower) walk(n.lower, bound);
		if (n.upper) walk(n.upper, bound);
	};
	walk(f.tree, /* @__PURE__ */ new Set());
	return bad;
}
// packages/engine/src/formula/open.ts
/** 記号 key（記号の葉か関数の名前）の定義になれる式を探す。左辺の頭が同じ記号・関数で、関数なら定義の引数がすべて記号のもの */
function definitionsFor(key, formulas) {
	const out = [];
	for (const f of formulas) {
		const t = f.tree;
		if (!isOp(t) || t.op !== "eq" || t.args.length < 2) continue;
		const lhs = t.args[0];
		if (isSym(lhs) && lhs.sym === key || isOp(lhs) && lhs.op === "fn" && lhs.name === key && lhs.args.every(isSym)) for (let side = 1; side < t.args.length; side++) out.push({
			formula: f,
			side
		});
	}
	return out;
}
const clone = (n) => JSON.parse(JSON.stringify(n));
/** 自由な記号の葉を別の木に置き換える（Σ・∫ で縛られた所は置き換えない） */
function substituteFree(node, map) {
	return replaceFree(node, (k) => {
		const r = map.get(k);
		return r ? clone(r) : void 0;
	});
}
const sub = (s) => s.replace(/_\{?([^}]*)\}?$/, "").trim();
/**
* 記号 key を定義で開く。開いた所（置き換えた木）を marks に key で記録する。count は開いた数（0 なら開けなかった。reason に理由）。
* 定義の式の記号は、まだない key だけ symbols に足す（同じ key は元の式の意味を残す）。
*/
function openSymbol(tree, symbols, key, def, marks = /* @__PURE__ */ new Map(), opt = {}) {
	const t = def.formula.tree;
	const lhs = t.args[0], rhs = t.args[def.side];
	const defSyms = def.formula.symbols;
	const extra = [];
	const outer = freeSymbols(tree);
	let count = 0;
	let reason;
	/** 1か所を開いた木を作る（params：定義の引数 → 実際の引数） */
	const build = (params) => {
		let body = clone(rhs);
		const rename = /* @__PURE__ */ new Map();
		for (const [p, arg] of params) for (const s of defSyms.filter((x) => x.of === p && freeSymbols(body).has(x.key))) {
			if (isSym(arg) && arg.sym === p) continue;
			if (isSym(arg)) {
				const k = `${s.key}_${arg.sym}`;
				const argSym = symbols.find((x) => x.key === arg.sym)?.symbol ?? arg.sym;
				const pSym = defSyms.find((x) => x.key === p)?.symbol ?? p;
				if (![...symbols, ...extra].some((x) => x.key === k)) extra.push({
					...s,
					key: k,
					symbol: `${sub(s.symbol)}_${argSym}`,
					of: arg.sym,
					meaning: s.meaning.split(pSym).join(argSym)
				});
				rename.set(s.key, { sym: k });
			} else {
				const d = opt.resolve?.(s).find((x) => isSym(x.formula.tree.args[0]));
				if (!d) {
					reason = `${s.symbol} は ${p} に属する記号で、引数が式のときに置き換える定義が見つからない`;
					return null;
				}
				rename.set(s.key, clone(d.formula.tree.args[d.side]));
			}
		}
		if (rename.size) body = substituteFree(body, rename);
		const avoid = /* @__PURE__ */ new Set([...outer, ...[...params.values()].flatMap((a) => [...freeSymbols(a)])]);
		for (const v of boundSymbols(body)) {
			if (!avoid.has(v)) continue;
			const nv = freshName(v, /* @__PURE__ */ new Set([
				...avoid,
				...boundSymbols(body),
				...freeSymbols(body),
				...symbols.map((x) => x.key),
				...extra.map((x) => x.key)
			]));
			body = renameBound(body, v, nv);
			const s = defSyms.find((x) => x.key === v);
			if (s && !extra.some((x) => x.key === nv)) extra.push({
				...s,
				key: nv,
				symbol: `${s.symbol}′`
			});
			avoid.add(nv);
		}
		return params.size ? substituteFree(body, params) : body;
	};
	const walk = (n) => {
		if (isSym(n)) {
			if (isSym(lhs) && n.sym === key) {
				const r = build(/* @__PURE__ */ new Map());
				if (!r) return n;
				count++;
				marks.set(r, key);
				return r;
			}
			return n;
		}
		if (isNum(n)) return n;
		if (n.op === "fn" && n.name === key && isOp(lhs) && lhs.op === "fn" && n.args.length === lhs.args.length) {
			const params = new Map(lhs.args.map((p, i) => [p.sym, n.args[i]]));
			const r = build(params);
			if (r) {
				count++;
				marks.set(r, key);
				return r;
			}
		}
		const out = {
			...n,
			args: n.args.map(walk)
		};
		if (n.lower) out.lower = walk(n.lower);
		if (n.upper) out.upper = walk(n.upper);
		const m = marks.get(n);
		if (m !== void 0) {
			marks.delete(n);
			marks.set(out, m);
		}
		return out;
	};
	const next = walk(tree);
	const have = new Set(symbols.map((x) => x.key));
	const added = [...defSyms.filter((x) => !have.has(x.key)), ...extra.filter((x) => !have.has(x.key))];
	return {
		tree: next,
		symbols: [...symbols, ...added],
		marks,
		count,
		...count === 0 && reason ? { reason } : {}
	};
}
/** 開いた手順を元の式から順に当て直す（閉じる＝手順から外して当て直す） */
function applyOpens(f, opens, opt = {}) {
	let cur = {
		tree: f.tree,
		symbols: f.symbols,
		marks: /* @__PURE__ */ new Map(),
		count: 0
	};
	for (const o of opens) {
		const r = openSymbol(cur.tree, cur.symbols, o.key, o.def, cur.marks, opt);
		cur = {
			...r,
			count: cur.count + r.count
		};
	}
	return cur;
}
// packages/engine/src/formula/domain.ts
/** 端の値（数か、記号の今の値。決まらなければ undefined） */
const bound = (b, values) => typeof b === "string" ? values[b] : b;
function inDomain(v, d, values = {}) {
	if (!Number.isFinite(v)) return false;
	if (d.integer && !Number.isInteger(v)) return false;
	if (d.nonzero && v === 0) return false;
	const lo = bound(d.min, values), hi = bound(d.max, values);
	if (lo !== void 0 && (d.minOpen ? v <= lo : v < lo)) return false;
	if (hi !== void 0 && (d.maxOpen ? v >= hi : v > hi)) return false;
	return true;
}
/** 定義域を文に（例：「0以上1以下」「0以上 n 以下の整数」「0より大きい」） */
function describeDomain(d, symbols = []) {
	const name = (b) => typeof b === "string" ? ` ${symbols.find((x) => x.key === b)?.symbol ?? b} ` : String(b);
	const parts = [];
	const lo = d.min !== void 0 ? `${name(d.min)}${d.minOpen ? "より大きい" : "以上"}` : "";
	const hi = d.max !== void 0 ? `${name(d.max)}${d.maxOpen ? "より小さい" : "以下"}` : "";
	if (lo || hi) parts.push([lo, hi].filter(Boolean).join("").replace(/\s+/g, " ").trim());
	if (d.nonzero) parts.push("0でない");
	const s = parts.join("・");
	return d.integer ? `${s}${s ? "の" : ""}整数` : s;
}
/** 入れた値のうち、定義域の外のもの（記号ごとに1文。記号どうしの範囲なら相手の今の値も添える） */
function checkDomain(values, symbols, conditions = []) {
	const out = [];
	for (const s of symbols) {
		const v = values[s.key];
		if (v === void 0 || !s.domain) continue;
		if (inDomain(v, s.domain, values)) continue;
		const refs = [s.domain.min, s.domain.max].filter((b) => typeof b === "string" && values[b] !== void 0).map((b) => `${symbols.find((x) => x.key === b)?.symbol ?? b}＝${values[b]}`);
		out.push(`${s.symbol} は ${describeDomain(s.domain, symbols)}（今 ${v}${refs.length ? `、${refs.join("・")}` : ""}）`);
	}
	for (const c of conditions) if (evaluate(c.tree, { values }) === 0) out.push(c.text);
	return out;
}
/** スライダーの範囲：定義域の端（記号どうしなら今の値）。端がなければ fallback。整数なら刻み1 */
function sliderRange(s, values, fallback) {
	const d = s.domain ?? {};
	let min = bound(d.min, values) ?? fallback.min, max = bound(d.max, values) ?? fallback.max;
	const step = d.integer ? 1 : fallback.step;
	if (d.minOpen) min += step;
	if (d.maxOpen) max -= step;
	if (d.integer) {
		min = Math.ceil(min);
		max = Math.floor(max);
	}
	return {
		min,
		max: Math.max(min, max),
		step
	};
}
/** 展開が止まった理由：引数がそろっているのに値にならない演算を探す（0 で割る・負の数の平方根など） */
function stopReason(node, env = {}) {
	if (!isOp(node)) return void 0;
	for (const a of node.args) {
		const r = stopReason(a, env);
		if (r) return r;
	}
	if (node.op === "eq" || node.op === "sum" || node.op === "prod" || node.op === "int") return void 0;
	if (!node.args.every((a) => isNum(a) || isSym(a) && (a.sym === "e" || a.sym === "pi"))) return void 0;
	const v = evaluate(node, env);
	if (v !== void 0 && Number.isFinite(v)) return void 0;
	const x = node.args.map((a) => evaluate(a, env));
	switch (node.op) {
		case "div": return x[1] === 0 ? "0 で割ることになる" : void 0;
		case "sqrt": return "負の数の平方根になる";
		case "pow": return x[0] === 0 && (x[1] ?? 0) < 0 ? "0 の負の累乗（0 で割る）になる" : "累乗が実数にならない";
		case "fn": return node.name === "log" ? "0以下の数の対数になる" : node.name === "comb" || node.name === "fact" ? "組合せ・階乗は0以上の整数だけ" : `${node.name} が計算できない`;
		default: return "値が有限にならない";
	}
}
// packages/engine/src/formula/parts.ts
/** 根からの args の番号で節を探す（[1, 0] は右辺の1つ目の因子） */
function nodeAt(tree, path) {
	let n = tree;
	for (const i of path) n = n && isOp(n) ? n.args[i] : void 0;
	return n;
}
/** 等しい式の右辺（なければ木そのもの） */
const rhsOf = (tree) => isOp(tree) && tree.op === "eq" ? tree.args[tree.args.length - 1] : tree;
/** 等しい式の左辺 */
const lhsOf = (tree) => isOp(tree) && tree.op === "eq" ? tree.args[0] : void 0;
/** 横軸の記号 over を lo〜hi の整数で動かしたときの右辺の値（確率の分布など）。計算できない所は undefined */
function distribution(tree, over, lo, hi, env = {}) {
	const body = rhsOf(tree), out = [];
	for (let x = Math.ceil(lo); x <= Math.floor(hi); x++) {
		const y = evaluate(body, {
			...env,
			values: {
				...env.values,
				[over]: x
			}
		});
		out.push({
			x,
			y: y !== void 0 && Number.isFinite(y) ? y : void 0
		});
	}
	return out;
}
export { COMMON_FNS, applyOpens, boundSymbols, checkDomain, comb, definitionsFor, describeDomain, distribution, evaluate, expand, factorial, fnsIn, formatNum, freeSymbols, freshName, inDomain, isNum, isOp, isSym, lhsOf, nodeAt, openSymbol, renameBound, replaceFree, rhsOf, sliderRange, stopReason, substitute, substituteFree, symbolTex, symbolsIn, toTex, validateFormula };
