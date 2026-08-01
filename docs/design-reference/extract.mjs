import fs from 'fs';
const src = fs.readFileSync('C:/Users/yongsik/nan2026/docs/design-reference/ticker-front-sprites.js', 'utf8');
const body = src.replace('class Component extends DCLogic {', 'class Component {');
const mod = body + '\nexport default Component;\n';
fs.writeFileSync('C:/Users/yongsik/AppData/Local/Temp/claude/C--Users-yongsik/64bae4ff-9da2-4969-8d60-959cfaa902d6/scratchpad/comp.mjs', mod);
const { default: C } = await import('./comp.mjs');
const c = new C();
const S = c.sheets();
const keys = Object.keys(S);
const method = {
  'tf-ally-01':'allyRookie()','tf-ally-02':'allyScout()','tf-ally-03':'allyAnchor()','tf-ally-parts':'allyParts()',
  'tf-enemy-01':'enemyRusher()','tf-enemy-02':'enemyBlocker()','tf-enemy-03':'enemyTank()',
  'tf-enemy-air-01':'enemyKite()','tf-enemy-air-02':'enemySiren()',
  'tf-tower-01':'towerBasic()','tf-tower-02':'towerAA()','tf-tower-03':'towerSplash()',
  'tf-base-ally':'baseAlly()','tf-base-enemy':'baseEnemy()','tf-boss':'boss()',
  'tf-bg-r1-far':'bgFar(1)','tf-bg-r1-mid':'bgMid(1)','tf-bg-r2-far':'bgFar(2)','tf-bg-r2-mid':'bgMid(2)',
  'tf-bg-r3-far':'bgFar(3)','tf-bg-r3-mid':'bgMid(3)',
  'tf-gnd-r1':'ground(1,1)','tf-gnd-r2':'ground(2,1)','tf-gnd-r3':'ground(3,1)',
  'tf-gnd-s1':'ground(1,1)','tf-gnd-s2':'ground(1,2)','tf-gnd-s3':'ground(1,3)','tf-gnd-slot':'groundSlot()',
  'tf-wx-01':'weather(1)','tf-wx-02':'weather(2)','tf-wx-03':'weather(3)','tf-wx-04':'weather(4)',
  'tf-fx-01':'fx(1)','tf-fx-02':'fx(2)','tf-fx-03':'fx(3)',
  'tf-w-01':'proj(1)','tf-w-02':'proj(2)','tf-w-03':'proj(3)','tf-w-04':'proj(4)',
  'tf-ui-chart':'uiChart()','tf-ui-btn':'uiButtons()','tf-ui-icons':'uiIcons()','tf-ui-reveal':'uiReveal()'
};
const ORDER = ['.','0','1','2','3','m','w','r','d','b','n','g','p'];
const rows = [];
let bad = [];
for (const k of keys) {
  const g = S[k];
  const h = g.length, w = g[0].length;
  const set = new Set();
  let ragged = false;
  for (const row of g) { if (row.length !== w) ragged = true; for (const ch of row) set.add(ch); }
  for (const ch of set) if (!(ch in c.PAL)) bad.push(k + ':' + ch);
  const chars = ORDER.filter(x => set.has(x));
  const unknown = [...set].filter(x => !ORDER.includes(x));
  // count non-transparent
  let filled = 0; for (const row of g) for (const ch of row) if (ch !== '.') filled++;
  rows.push({ k, m: method[k], w, h, chars: chars.join(''), unknown: unknown.join(''), ragged, fillPct: ((filled/(w*h))*100).toFixed(0) });
}
console.log('COUNT', keys.length);
console.log(JSON.stringify(rows, null, 0).replace(/},/g, '},\n'));
console.log('BAD_CHARS', JSON.stringify(bad));
// duplicate check: gnd-r1 vs gnd-s1
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
console.log('tf-gnd-r1 === tf-gnd-s1 ?', eq(S['tf-gnd-r1'], S['tf-gnd-s1']));
// any other identical pairs
const dups = [];
for (let i=0;i<keys.length;i++) for (let j=i+1;j<keys.length;j++) if (eq(S[keys[i]],S[keys[j]])) dups.push(keys[i]+'=='+keys[j]);
console.log('DUP_PAIRS', JSON.stringify(dups));
console.log('PAL', JSON.stringify(c.PAL));
console.log('MAP', JSON.stringify(c.MAP));
// hash each grid for snapshot baseline
import crypto from 'crypto';
const hashes = {};
for (const k of keys) hashes[k] = crypto.createHash('sha256').update(S[k].map(r=>r.join('')).join('\n')).digest('hex').slice(0,12);
console.log('HASHES', JSON.stringify(hashes, null, 0));
fs.writeFileSync('C:/Users/yongsik/AppData/Local/Temp/claude/C--Users-yongsik/64bae4ff-9da2-4969-8d60-959cfaa902d6/scratchpad/grids.json', JSON.stringify(S));
