// ばね（spring）の動き（stats2-course #42：Apple のような操作感）。
// iOS の SwiftUI と同じ2つの値で決める：response（揺れの周期・秒。小さいほど速い）と dampingFraction（減衰。1 で行き過ぎない、1 未満で少し弾む）。
// CSS では linear() の折れ線で表す（tokens.json の ease-spring・ease-bounce。値はここから作り、テストで照らす）。

/** t 秒後の位置（0 から 1 へ。1 を少し越えてから戻ることがある） */
export function springAt(t, response, damping) {
  const w = (2 * Math.PI) / response;
  if (damping >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
}

/** duration 秒のあいだを steps 個の点で折れ線にした CSS の linear()。最後は必ず 1 */
export function springLinear(response, damping, duration, steps = 32) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const v = i === steps ? 1 : springAt((duration * i) / steps, response, damping);
    pts.push(Number(v.toFixed(4)));
  }
  return `linear(${pts.join(", ")})`;
}

// npm run springs：tokens.json の $extensions.spring から $value を作り直す
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL("../tokens.json", import.meta.url);
  const json = JSON.parse(readFileSync(file, "utf8"));
  for (const t of Object.values(json.motion)) {
    const sp = t?.$extensions?.spring;
    if (sp) t.$value = springLinear(sp.response, sp.damping, sp.duration);
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log("tokens.json のばねの値を作り直した");
}
