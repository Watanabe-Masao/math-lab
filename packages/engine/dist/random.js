// 生成物：packages/engine/src/random.ts から scripts/bundle-formula.mjs で作る。手で直さない（npm run bundle）
var MLRandom = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	// packages/engine/src/random.ts
	/** 種を 32 ビットの整数にそろえる（小数・負の数・大きな数でも同じ規則で）。 */
	function normalizeSeed(seed) {
		if (!Number.isFinite(seed)) throw new RangeError(`種は有限の数：${seed}`);
		return Math.trunc(seed) >>> 0;
	}
	function createRandom(seed) {
		const start = normalizeSeed(seed);
		let a = start;
		const next = () => {
			a = a + 1831565813 >>> 0;
			let t = a;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
		return {
			seed: start,
			next,
			int(lo, hi) {
				if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw new RangeError(`int(${lo}, ${hi})：整数で lo ≤ hi`);
				return lo + Math.floor(next() * (hi - lo + 1));
			},
			chance(p) {
				if (!(p >= 0 && p <= 1)) throw new RangeError(`確率は 0〜1：${p}`);
				return next() < p;
			},
			fork() {
				return createRandom(Math.floor(next() * 4294967296));
			}
		};
	}
	/** 標準正規分布の数（Box–Muller。u＝0 は引き直す。1回に2つ引く） */
	function normal(r) {
		let u = 0;
		while (u === 0) u = r.next();
		const v = r.next();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}
	/** 並べ替えた新しい配列（Fisher–Yates。元の配列は変えない） */
	function shuffle(r, xs) {
		const a = xs.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = r.int(0, i);
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}
	/** 戻さずに k 個を引く（並べ替えの先頭 k 個。k は 0〜長さ） */
	function sampleWithout(r, xs, k) {
		if (!Number.isInteger(k) || k < 0 || k > xs.length) throw new RangeError(`引く数は 0〜${xs.length} の整数：${k}`);
		return shuffle(r, xs).slice(0, k);
	}
	exports.createRandom = createRandom;
	exports.normal = normal;
	exports.normalizeSeed = normalizeSeed;
	exports.sampleWithout = sampleWithout;
	exports.shuffle = shuffle;
	return exports;
})({});
