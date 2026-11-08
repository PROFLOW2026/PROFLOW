import fs from "node:fs";
import zlib from "node:zlib";
function lin(c){ const s=c/255; return s<=0.04045?s/12.92:Math.pow((s+0.055)/1.055,2.4); }
function lum(hex){ const h=hex.replace("#",""); const n=parseInt(h,16); const r=(n>>16)&255,g=(n>>8)&255,b=n&255; return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); }
function ratio(a,b){ const L1=lum(a), L2=lum(b); const hi=Math.max(L1,L2), lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); }
const pairs = [
  ["premium-light-primary", "#ffffff", "#0b665f", 4.5],
  ["premium-light-primary-hover", "#ffffff", "#0b524c", 4.5],
  ["premium-light-primary-active", "#ffffff", "#0b433f", 4.5],
  ["premium-dark-primary", "#04201d", "#36b8a8", 4.5],
  ["premium-dark-primary-hover", "#04201d", "#4cd0c0", 4.5],
  ["premium-dark-primary-active", "#04201d", "#5fd3c4", 4.5],
  ["premium-light-rail-text", "#11181b", "#ffffff", 4.5],
  ["premium-light-rail-muted", "#566165", "#ffffff", 4.5],
  ["premium-light-ink-indicator", "#172025", "#ffffff", 3],
  ["modern-light-primary", "#ffffff", "#0a6b63", 4.5],
  ["modern-dark-primary", "#04201d", "#2bb3a3", 4.5],
  ["premium-light-body", "#11181b", "#eef0f1", 4.5],
  ["premium-dark-body", "#e9eef0", "#0c1012", 4.5],
  ["modern-light-body", "#0f1923", "#f5f7f9", 4.5],
  ["modern-dark-body", "#e8eef3", "#0e1318", 4.5],
];
const rows = pairs.map(([id, fg, bg, min]) => {
  const value = Math.round(ratio(fg, bg) * 100) / 100;
  return { id, fg, bg, min, value, pass: value >= min };
});
const files = ["tokens-structure.css","modern.css","modern-hooks.css","premium.css","premium-hooks.css"].map((name) => {
  const buf = fs.readFileSync("src/shared/theme/styles/"+name);
  return { name, bytes: buf.length, gzip: zlib.gzipSync(buf).length };
});
const evidence = { generatedAt: new Date().toISOString(), contrast: rows, css: files, contrastPass: rows.every((r)=>r.pass) };
fs.mkdirSync("docs/design/exlfy-design-v2/evidence", { recursive: true });
fs.writeFileSync("docs/design/exlfy-design-v2/evidence/contrast-and-css.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ contrastPass: evidence.contrastPass, fails: rows.filter((r)=>!r.pass), css: files }, null, 2));