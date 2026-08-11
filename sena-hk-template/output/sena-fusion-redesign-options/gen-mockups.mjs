// Generates the three SVG mockups for the SENA Fusion redesign proposal.
// Run: node gen-mockups.mjs  → writes hero.svg, comparison.svg, orbit.svg
import { writeFileSync } from 'node:fs';

// ---------- palette ----------
const C = {
  ink: '#0D1526', muted: '#435369', faint: '#7A8A94', hair: '#C6D4D1',
  plateFrame: '#CBD9D6', paper: '#FFFFFF', canvas: '#FAFCFC',
  S: '#2451CC', W: '#A06BF5', B: '#0891B2', G: '#DB2777',
  unit: '#C2379B', hexStroke: '#12B4CF', hexFill: '#F8FBFF',
  cyan: '#24DCEE', headerBg: '#ECF2F1', headerText: '#5B6B75',
  planBlue: '#218EBF', reflOrange: '#EF691B',
};

// ---------- helpers ----------
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function mix(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map(h => parseInt(h, 16));
  const b = hexB.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const r2 = n => Math.round(n * 100) / 100;
function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    pts.push(`${r2(cx + r * Math.cos(a))},${r2(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}
function personHex(cx, cy, r, initials, opts = {}) {
  const ring = opts.ring ? `<polygon points="${hexPoints(cx, cy, r + 5)}" fill="none" stroke="${opts.ring}" stroke-width="3" opacity="0.55"/>` : '';
  return `${ring}<polygon points="${hexPoints(cx, cy, r)}" fill="${C.hexFill}" stroke="${opts.stroke || C.hexStroke}" stroke-width="2.4"/>
<text x="${cx}" y="${cy + r * 0.16}" text-anchor="middle" font-size="${Math.max(12, r * 0.52)}" font-weight="900" fill="${C.ink}" dominant-baseline="middle">${initials}</text>`;
}
function label(x, y, text, { size = 12.5, weight = 600, fill = C.muted, anchor = 'start', ls = 0, family } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}"${ls ? ` letter-spacing="${ls}"` : ''}${family ? ` font-family="${family}"` : ''}>${esc(text)}</text>`;
}
function chip(x, y, text, color, { size = 10.5, pad = 9 } = {}) {
  const w = text.length * size * 0.62 + pad * 2;
  return { w, svg: `<rect x="${x}" y="${y}" width="${r2(w)}" height="22" rx="11" fill="${color}" fill-opacity="0.10" stroke="${color}" stroke-opacity="0.45"/>
<text x="${r2(x + w / 2)}" y="${y + 14.7}" text-anchor="middle" font-size="${size}" font-weight="900" fill="${color}" letter-spacing="0.4">${esc(text)}</text>` };
}
function arrowHead(px, py, dx, dy, width, color, opacity, casing) {
  const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
  const L = Math.min(14, Math.max(9, width * 2.6)), Wd = L * 0.55;
  const bx = px - ux * L, by = py - uy * L;
  const p1 = `${r2(px)},${r2(py)}`;
  const p2 = `${r2(bx - uy * Wd)},${r2(by + ux * Wd)}`;
  const p3 = `${r2(bx + uy * Wd)},${r2(by - ux * Wd)}`;
  const base = `<polygon points="${p1} ${p2} ${p3}" fill="${color}" opacity="${opacity}"/>`;
  if (!casing) return base;
  // paper casing under the arrow so it reads over any line beneath
  return `<polygon points="${p1} ${p2} ${p3}" fill="none" stroke="${casing}" stroke-width="5" stroke-linejoin="round"/>` + base;
}
// orbit-lane tie with PORT DOCKING: each tie keeps its lane all the way and
// docks at its own port on the node perimeter, so reciprocal pairs never merge.
// Returns {line, arrow} so callers can paint all lines first, all arrows on top.
function orbitTie(cx, cy, rx, ry, th1, th2, off, w, srcR, tgtR, color, casing = '#FFFFFF') {
  const N = 160;
  const rAvg = (rx + ry) / 2;
  const s = Math.sign(th2 - th1) || 1;
  // ports: depart slightly along the sweep; arrive pulled back ∝ lane offset
  const dStart = s * (6 + off * 0.30) / rAvg;
  const dEnd = s * (tgtR * 0.55 + off * 0.75) / rAvg;
  const a1 = th1 + dStart, a2 = th2 - dEnd;
  // envelope: rise, plateau at the lane, ease down to a nonzero dock height
  const env = t => {
    const rise = Math.sin(Math.PI / 2 * Math.min(1, t / 0.22));
    const fall = 0.16 + 0.84 * Math.sin(Math.PI / 2 * Math.min(1, (1 - t) / 0.2));
    return Math.min(rise, fall);
  };
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, th = a1 + (a2 - a1) * t;
    const bx = cx + rx * Math.cos(th), by = cy + ry * Math.sin(th);
    const rl = Math.hypot(bx - cx, by - cy);
    const uxr = (bx - cx) / rl, uyr = (by - cy) / rl;
    pts.push([bx + uxr * off * env(t), by + uyr * off * env(t)]);
  }
  const srcC = [cx + rx * Math.cos(th1), cy + ry * Math.sin(th1)];
  const tgtC = [cx + rx * Math.cos(th2), cy + ry * Math.sin(th2)];
  let i0 = 0; while (i0 < N && Math.hypot(pts[i0][0] - srcC[0], pts[i0][1] - srcC[1]) < srcR + 7) i0++;
  let i1 = N; while (i1 > 0 && Math.hypot(pts[i1][0] - tgtC[0], pts[i1][1] - tgtC[1]) < tgtR + 11) i1--;
  const sl = pts.slice(i0, i1 + 1);
  const d = 'M' + sl.map(p => `${r2(p[0])} ${r2(p[1])}`).join(' L');
  const width = 2.5 + 6 * w, opacity = 0.5 + 0.4 * w;
  const [lx, ly] = sl[sl.length - 1], [px, py] = sl[sl.length - 4];
  // aim the arrow tip at the nearest point on the node perimeter
  const toC = [tgtC[0] - lx, tgtC[1] - ly]; const tl = Math.hypot(toC[0], toC[1]) || 1;
  const tipX = lx + toC[0] / tl * Math.max(0, tl - (tgtR + 2)) * 0.55;
  const tipY = ly + toC[1] / tl * Math.max(0, tl - (tgtR + 2)) * 0.55;
  const mixDx = (lx - px) * 0.6 + toC[0] / tl * 8, mixDy = (ly - py) * 0.6 + toC[1] / tl * 8;
  return {
    line: `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r2(width)}" opacity="${r2(opacity)}" stroke-linecap="round"/>`,
    arrow: arrowHead(tipX, tipY, mixDx, mixDy, width, color, Math.min(1, opacity + 0.15), casing),
  };
}
function ciBox(mx, my, hw, hh, color) {
  return `<rect x="${r2(mx - hw)}" y="${r2(my - hh)}" width="${r2(hw * 2)}" height="${r2(hh * 2)}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="5 4"/>
<rect x="${mx - 5.5}" y="${my - 5.5}" width="11" height="11" fill="${color}"/>`;
}
function callout(x, y, n) {
  return `<circle cx="${x}" cy="${y}" r="11" fill="#0AA7C4"/><text x="${x}" y="${y + 4.2}" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">${n}</text>`;
}

// =====================================================================
// HERO
// =====================================================================
const Wd = 1280, Hd = 900, cx = 640, cy = 470, scale = 230;
const px = v => cx + v * scale, py = v => cy - v * scale;

const codes = [
  { id: 'Q', name: 'Question',     x: 0.52,  y: 0.38,  r: 12,  lbl: 'right' },
  { id: 'H', name: 'Hypothesis',   x: 0.68,  y: -0.18, r: 9,   lbl: 'right' },
  { id: 'E', name: 'Evidence',     x: -0.38, y: 0.30,  r: 13,  lbl: 'left' },
  { id: 'X', name: 'Explanation',  x: -0.30, y: -0.42, r: 10,  lbl: 'left' },
  { id: 'C', name: 'Critique',     x: 0.10,  y: -0.60, r: 8,   lbl: 'right' },
  { id: 'R', name: 'Reflection',   x: -0.68, y: -0.18, r: 6,   lbl: 'left' },
  { id: 'Co', name: 'Coordination', x: -0.08, y: 0.62, r: 5,   lbl: 'left' },
];
const cmap = Object.fromEntries(codes.map(c => [c.id, c]));
const wEdges = [
  ['Q', 'E', 1.0], ['Q', 'H', 0.85], ['E', 'X', 0.7], ['Q', 'C', 0.55], ['H', 'E', 0.5],
  ['X', 'C', 0.45], ['E', 'R', 0.35], ['Q', 'X', 0.3], ['H', 'C', 0.22], ['C', 'R', 0.15], ['Co', 'Q', 0.12],
].sort((a, b) => b[2] - a[2]);

const units = [
  { id: 'ML', name: 'Ms Lee',  x: 0.30,  y: 0.24 },
  { id: 'MC', name: 'Mr Chan', x: 0.55,  y: 0.05 },
  { id: 'MH', name: 'Ms Ho',   x: -0.45, y: -0.05 },
  { id: 'DW', name: 'Dr Wong', x: -0.15, y: -0.38 },
];

const orx = 490, ory = 300;
const persons = [
  { id: 'ML', name: 'Ms Lee',  th: -Math.PI / 2,        r: 30, side: 'below-left' },
  { id: 'MC', name: 'Mr Chan', th: -10 * Math.PI / 180, r: 26, side: 'right' },
  { id: 'MH', name: 'Ms Ho',   th: 185 * Math.PI / 180, r: 18, side: 'below' },
  { id: 'DW', name: 'Dr Wong', th: 95 * Math.PI / 180,  r: 22, side: 'below' },
];
for (const p of persons) { p.px = cx + orx * Math.cos(p.th); p.py = cy + ory * Math.sin(p.th); }
const pmap = Object.fromEntries(persons.map(p => [p.id, p]));
const deg = d => d * Math.PI / 180;
const sTies = [
  { s: 'ML', t: 'MC', th1: deg(-90),  th2: deg(-10),  off: 24, w: 0.9 },
  { s: 'MC', t: 'ML', th1: deg(-10),  th2: deg(-90),  off: 50, w: 0.55 },
  { s: 'ML', t: 'MH', th1: deg(-90),  th2: deg(-175), off: 24, w: 0.25 },
  { s: 'ML', t: 'DW', th1: deg(-90),  th2: deg(-265), off: 60, w: 0.6 },
  { s: 'DW', t: 'ML', th1: deg(-265), th2: deg(-90),  off: 84, w: 0.35 },
  { s: 'MC', t: 'DW', th1: deg(-10),  th2: deg(95),   off: 24, w: 0.4 },
];

let h = [];
h.push(`<svg viewBox="0 0 ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Redesigned SENA Fusion plot: canonical ENA plane with a social orbit">`);
h.push(`<rect width="${Wd}" height="${Hd}" rx="10" fill="${C.paper}" stroke="#B3CDC9"/>`);
// header bar
h.push(`<path d="M0 10 a10 10 0 0 1 10 -10 H${Wd - 10} a10 10 0 0 1 10 10 V46 H0 Z" fill="${C.headerBg}"/>`);
h.push(label(20, 29, 'FUSION PLOT — CURRENT WINDOW', { size: 13, weight: 900, fill: C.headerText, ls: 0.6 }));
{
  const c1 = chip(292, 12, 'PLAN · TURNS 1–3', '#0AA7C4'); h.push(c1.svg);
  const c2 = chip(880, 12, 'MIN EDGE WEIGHT 0.16', '#5B6B75'); h.push(c2.svg);
  const c3 = chip(1052, 12, '⊖ 100% ⊕', '#5B6B75'); h.push(c3.svg);
  const c4 = chip(1152, 12, '⤢ MAXIMIZE', '#0AA7C4'); h.push(c4.svg);
}
// provenance strip
h.push(`<line x1="0" y1="92" x2="${Wd}" y2="92" stroke="${C.plateFrame}"/>`);
{
  let x = 20;
  for (const [t, col] of [
    ['ENA PLANE · jENA SVD · d 2 · DETERMINISTIC', C.W],
    ['NODES CO-REGISTERED · GoF r .93', C.W],
    ['SOCIAL ORBIT · EXPLANATORY RING', C.S],
    ['B OVERLAY ≤ MEDIAN W WIDTH', C.B],
  ]) { const c = chip(x, 58, t, col); h.push(c.svg); x += c.w + 10; }
  h.push(callout(1180, 69, 6));
}
// canvas
h.push(`<rect x="12" y="100" width="${Wd - 24}" height="740" fill="${C.canvas}"/>`);
// ENA plate
const pl = 250;
h.push(`<rect x="${cx - pl}" y="${cy - pl}" width="${pl * 2}" height="${pl * 2}" fill="${C.paper}" stroke="${C.plateFrame}" stroke-width="1.2"/>`);
h.push(`<line x1="${cx - pl}" y1="${cy}" x2="${cx + pl}" y2="${cy}" stroke="${C.hair}" stroke-width="1"/>`);
h.push(`<line x1="${cx}" y1="${cy - pl}" x2="${cx}" y2="${cy + pl}" stroke="${C.hair}" stroke-width="1"/>`);
// axis titles (webENA two-line form: Y at top of vertical axis, X at left end)
h.push(label(cx + 8, cy - pl + 18, 'SVD2', { size: 12, weight: 900, fill: C.muted }));
h.push(label(cx + 8, cy - pl + 32, '(28.5%)', { size: 11, fill: C.faint }));
h.push(label(cx - pl + 8, cy + 16, 'SVD1', { size: 12, weight: 900, fill: C.muted }));
h.push(label(cx - pl + 8, cy + 30, '(51.0%)', { size: 11, fill: C.faint }));
// orbit guide
h.push(`<ellipse cx="${cx}" cy="${cy}" rx="${orx}" ry="${ory}" fill="none" stroke="#94A8C4" stroke-width="1.4" stroke-dasharray="2 7" opacity="0.35"/>`);
// S ties (lanes): all lines first, all port-docked cased arrows on top
{
  const tieLines = [], tieArrows = [];
  for (const t of sTies) {
    const s = pmap[t.s], g = pmap[t.t];
    const tie = orbitTie(cx, cy, orx, ory, t.th1, t.th2, t.off, t.w, s.r, g.r, C.S, C.canvas);
    tieLines.push(tie.line); tieArrows.push(tie.arrow);
  }
  h.push(...tieLines, ...tieArrows);
}
// B bridges from ML (selected)
const ml = pmap.ML;
const bridges = [['Q', 0.8], ['E', 0.6], ['Co', 0.3]];
const medW = 1.5 + 0.45 * 7.5;
for (const [cid, bw] of bridges) {
  const c = cmap[cid], tx = px(c.x), ty = py(c.y);
  const dx = tx - ml.px, dy = ty - ml.py, L = Math.hypot(dx, dy);
  const x1 = ml.px + dx / L * (ml.r + 8), y1 = ml.py + dy / L * (ml.r + 8);
  const x2 = tx - dx / L * (c.r + 4), y2 = ty - dy / L * (c.r + 4);
  h.push(`<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${C.B}" stroke-width="${r2(Math.min(medW, 1.5 + bw * 4.5))}" opacity="${r2(0.28 + bw * 0.25)}" stroke-linecap="round"/>`);
}
// W edges
for (const [a, b, w] of wEdges) {
  const A = cmap[a], B2 = cmap[b];
  const col = mix(C.W, '#AEB9C4', (1 - w) * 0.55);
  h.push(`<line x1="${r2(px(A.x))}" y1="${r2(py(A.y))}" x2="${r2(px(B2.x))}" y2="${r2(py(B2.y))}" stroke="${col}" stroke-width="${r2(1.5 + w * 7.5)}" opacity="${r2(0.3 + w * 0.7)}" stroke-linecap="round"/>`);
}
// unit points
for (const u of units) {
  const ux = px(u.x), uy = py(u.y);
  h.push(`<circle cx="${r2(ux)}" cy="${r2(uy)}" r="5" fill="${C.unit}"/>`);
  h.push(label(ux - 8, uy - 8, u.id, { size: 9.5, weight: 700, fill: C.faint, anchor: 'end' }));
}
// selection: ML unit hexring + leader + plate
{
  const u = units[0], ux = px(u.x), uy = py(u.y);
  h.push(`<polygon points="${hexPoints(ux, uy, 11)}" fill="none" stroke="${C.hexStroke}" stroke-width="2"/>`);
  h.push(`<line x1="${r2(ux)}" y1="${r2(uy - 12)}" x2="${r2(ml.px + 6)}" y2="${r2(ml.py + ml.r + 8)}" stroke="${C.hexStroke}" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.75"/>`);
  h.push(`<rect x="${ux + 12}" y="${uy - 10}" width="62" height="21" rx="5" fill="#fff" fill-opacity="0.95" stroke="${C.plateFrame}"/>`);
  h.push(label(ux + 43, uy + 4.5, 'Ms Lee', { size: 11.5, weight: 900, fill: C.ink, anchor: 'middle' }));
}
// code nodes + labels
for (const c of codes) {
  const nx = px(c.x), ny = py(c.y);
  h.push(`<circle cx="${r2(nx)}" cy="${r2(ny)}" r="${c.r}" fill="#1F2E38"/>`);
  const o = { size: 12.5, weight: 700, fill: '#24333C' };
  if (c.lbl === 'right') h.push(label(nx + c.r + 6, ny + 4, c.name, o));
  else if (c.lbl === 'left') h.push(label(nx - c.r - 6, ny + 4, c.name, { ...o, anchor: 'end' }));
  else h.push(label(nx - c.r - 6, ny - 8, c.name, { ...o, anchor: 'end' }));
}
// person hexes + labels (per-person side, collision-checked)
for (const p of persons) {
  h.push(personHex(p.px, p.py, p.r, p.id));
  const o = { size: 12.5, weight: 900, fill: '#33434E' };
  if (p.side === 'left') h.push(label(p.px - p.r - 10, p.py + 4, p.name, { ...o, anchor: 'end' }));
  else if (p.side === 'right') h.push(label(p.px + p.r + 10, p.py + 4, p.name, o));
  else if (p.side === 'below-left') h.push(label(p.px - p.r - 25, p.py + p.r + 20, p.name, { ...o, anchor: 'end' }));
  else h.push(label(p.px, p.py + p.r + 22, p.name, { ...o, anchor: 'middle' }));
}
// legend plate (lower-left canvas, outside the ENA plate)
{
  const lx = 48, ly = 608, lw = 234, lh = 186;
  h.push(`<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="8" fill="#fff" fill-opacity="0.93" stroke="${C.plateFrame}"/>`);
  h.push(label(lx + 14, ly + 22, 'LAYERS', { size: 10, weight: 900, fill: C.faint, ls: 1 }));
  const row = (i, glyph, text) => {
    const y = ly + 44 + i * 26;
    h.push(glyph(lx + 14, y));
    h.push(label(lx + 44, y + 4, text, { size: 11, weight: 600, fill: C.muted }));
  };
  row(0, (x, y) => `<line x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" stroke="${C.W}" stroke-width="4" stroke-linecap="round"/>`, 'W concept link · weight');
  row(1, (x, y) => `<circle cx="${x + 11}" cy="${y}" r="6" fill="#1F2E38"/>`, 'Code · size = connectivity');
  row(2, (x, y) => `<circle cx="${x + 11}" cy="${y}" r="4.5" fill="${C.unit}"/>`, 'Unit point (participant)');
  row(3, (x, y) => `<path d="M${x} ${y + 3} Q ${x + 11} ${y - 7} ${x + 20} ${y + 1}" fill="none" stroke="${C.S}" stroke-width="3" stroke-linecap="round"/>` + arrowHead(x + 22, y + 2, 2, 1, 3, C.S, 0.95), 'S social tie · directed');
  row(4, (x, y) => `<line x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" stroke="${C.B}" stroke-width="3" opacity="0.6" stroke-linecap="round"/>`, 'B bridge · selected unit');
}
// in-SVG model footer
h.push(label(cx, 828, 'Units: participant · Conversation: lesson › stanza · Window: moving stanza (back 2) · Rotation: SVD · Co-registration r = .93 / ρ = .91', { size: 10.5, fill: C.faint, anchor: 'middle', family: 'ui-monospace, SFMono-Regular, Menlo, monospace' }));
// callouts
h.push(callout(905, 232, 1));
h.push(callout(505, 355, 2));
h.push(callout(1168, 322, 3));
h.push(callout(560, 270, 4));
h.push(callout(802, 398, 5));
// bottom layer-key chips
h.push(`<line x1="0" y1="848" x2="${Wd}" y2="848" stroke="${C.plateFrame}"/>`);
{
  let x = 20;
  for (const [t, col] of [
    ['S · SOCIAL TIES · 6', C.S], ['W · CONCEPT LINKS · 10 OF 11', C.W],
    ['B · BRIDGES · 3 OF 12 · FOCUS', C.B], ['G · PAIR SIGNALS · 30 · TEMPORAL', C.G],
  ]) { const c = chip(x, 862, t, col); h.push(c.svg); x += c.w + 10; }
  h.push(label(Wd - 20, 877, 'ACTIVE VIEW · FUSION', { size: 10.5, weight: 900, fill: C.faint, anchor: 'end', ls: 0.8 }));
}
h.push('</svg>');
writeFileSync(new URL('./hero.svg', import.meta.url), h.join('\n'));

// =====================================================================
// COMPARISON (subtraction plot)
// =====================================================================
const cw = 640, ch = 600, ccx = 320, ccy = 300, cs = 190, cpl = 210;
const qx = v => ccx + v * cs, qy = v => ccy - v * cs;
let k = [];
k.push(`<svg viewBox="0 0 ${cw} ${ch}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Comparison mockup: Plan vs Reflect subtraction network with means and confidence intervals">`);
k.push(`<rect width="${cw}" height="${ch}" rx="10" fill="${C.paper}" stroke="#B3CDC9"/>`);
k.push(label(20, 34, 'COMPARISON — PLAN VS REFLECT', { size: 12.5, weight: 900, fill: C.headerText, ls: 0.6 }));
{ const c = chip(452, 16, 'MEANS ROTATION · Δ × 3', '#5B6B75', { size: 9.5 }); k.push(c.svg); }
k.push(`<rect x="${ccx - cpl}" y="${ccy - cpl}" width="${cpl * 2}" height="${cpl * 2}" fill="${C.paper}" stroke="${C.plateFrame}" stroke-width="1.2"/>`);
k.push(`<line x1="${ccx - cpl}" y1="${ccy}" x2="${ccx + cpl}" y2="${ccy}" stroke="${C.hair}"/>`);
k.push(`<line x1="${ccx}" y1="${ccy - cpl}" x2="${ccx}" y2="${ccy + cpl}" stroke="${C.hair}"/>`);
k.push(label(ccx + 8, ccy - cpl + 18, 'SVD2', { size: 11.5, weight: 900, fill: C.muted }));
k.push(label(ccx + 8, ccy - cpl + 32, '(24.1%)', { size: 10.5, fill: C.faint }));
k.push(label(ccx - cpl + 8, ccy + 16, 'MR1', { size: 11.5, weight: 900, fill: C.muted }));
k.push(label(ccx - cpl + 8, ccy + 30, '(38.2%)', { size: 10.5, fill: C.faint }));
// group names, colored, top-left inside plate (webENA convention)
k.push(`<circle cx="${ccx - cpl + 18}" cy="${ccy - cpl + 22}" r="5" fill="${C.planBlue}"/>`);
k.push(label(ccx - cpl + 30, ccy - cpl + 26, 'Plan (turns 1–3)', { size: 11.5, weight: 900, fill: C.planBlue }));
k.push(`<circle cx="${ccx - cpl + 18}" cy="${ccy - cpl + 42}" r="5" fill="${C.reflOrange}"/>`);
k.push(label(ccx - cpl + 30, ccy - cpl + 46, 'Reflect (turns 3–10)', { size: 11.5, weight: 900, fill: C.reflOrange }));
// subtraction edges
const subEdges = [
  ['E', 'X', -0.85], ['Q', 'H', 0.75], ['E', 'R', -0.6], ['Q', 'Co', 0.45],
  ['X', 'C', -0.4], ['Q', 'E', -0.3], ['H', 'E', 0.22], ['C', 'R', -0.15],
].sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
for (const [a, b, d] of subEdges) {
  const A = cmap[a], B2 = cmap[b];
  const base = d >= 0 ? C.planBlue : C.reflOrange, ad = Math.abs(d);
  const col = mix(base, '#AEB9C4', (1 - ad) * 0.5);
  k.push(`<line x1="${r2(qx(A.x))}" y1="${r2(qy(A.y))}" x2="${r2(qx(B2.x))}" y2="${r2(qy(B2.y))}" stroke="${col}" stroke-width="${r2(1 + ad * 8)}" opacity="${r2(0.35 + ad * 0.6)}" stroke-linecap="round"/>`);
}
// unit points per group
const planUnits = [[0.24, 0.50], [0.38, 0.32], [0.18, 0.56], [0.40, 0.38]];
const reflUnits = [[-0.40, -0.22], [-0.25, -0.40], [-0.52, -0.08], [-0.30, -0.28]];
for (const [x, y] of planUnits) k.push(`<circle cx="${r2(qx(x))}" cy="${r2(qy(y))}" r="4" fill="${C.planBlue}" opacity="0.85"/>`);
for (const [x, y] of reflUnits) k.push(`<circle cx="${r2(qx(x))}" cy="${r2(qy(y))}" r="4" fill="${C.reflOrange}" opacity="0.85"/>`);
// neutral code nodes (smaller radii for this plate)
for (const c of codes) {
  const nx = qx(c.x), ny = qy(c.y), rr = c.r * 0.8;
  k.push(`<circle cx="${r2(nx)}" cy="${r2(ny)}" r="${r2(rr)}" fill="#1F2E38"/>`);
  const o = { size: 11, weight: 700, fill: '#24333C' };
  if (c.lbl === 'right') k.push(label(nx + rr + 5, ny + 3.5, c.name, o));
  else if (c.lbl === 'left') k.push(label(nx - rr - 5, ny + 3.5, c.name, { ...o, anchor: 'end' }));
  else k.push(label(nx - rr - 5, ny - 7, c.name, { ...o, anchor: 'end' }));
}
// means + CI boxes
k.push(ciBox(qx(0.30), qy(0.44), 0.12 * cs, 0.11 * cs, C.planBlue));
k.push(label(qx(0.30), qy(0.44) + 0.11 * cs + 14, 'Plan mean', { size: 10.5, weight: 700, fill: C.planBlue, anchor: 'middle' }));
k.push(ciBox(qx(-0.37), qy(-0.245), 0.11 * cs, 0.13 * cs, C.reflOrange));
k.push(label(qx(-0.37) - 0.11 * cs - 6, qy(-0.245) + 4, 'Reflect mean', { size: 10.5, weight: 700, fill: C.reflOrange, anchor: 'end' }));
// footer
k.push(label(ccx, ch - 22, 'Edge = Δ mean line weight × 3 · colour = stronger group · nodes neutral · dashed box = 95% t-interval per dimension', { size: 10, fill: C.faint, anchor: 'middle', family: 'ui-monospace, SFMono-Regular, Menlo, monospace' }));
k.push('</svg>');
writeFileSync(new URL('./comparison.svg', import.meta.url), k.join('\n'));

// =====================================================================
// ORBIT ANATOMY
// =====================================================================
const ow = 1200, oh = 360;
let o = [];
o.push(`<svg viewBox="0 0 ${ow} ${oh}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Anatomy of the social orbit: node size, community rings, directed lanes, always-on labels">`);
o.push(`<rect width="${ow}" height="${oh}" rx="10" fill="${C.paper}" stroke="#B3CDC9"/>`);
o.push(`<defs><clipPath id="panelClip"><rect x="1.5" y="1.5" width="${ow - 3}" height="${oh - 3}" rx="10"/></clipPath></defs>`);
// big ellipse whose top arc passes through the band
const ocx = 600, ocy = 1050, orx2 = 860, ory2 = 830;
o.push(`<g clip-path="url(#panelClip)">`);
o.push(`<ellipse cx="${ocx}" cy="${ocy}" rx="${orx2}" ry="${ory2}" fill="none" stroke="#94A8C4" stroke-width="1.4" stroke-dasharray="2 7" opacity="0.4"/>`);
const oth = a => deg(a);
const opt = a => [ocx + orx2 * Math.cos(oth(a)), ocy + ory2 * Math.sin(oth(a))];
const [ax, ay] = opt(-115), [bx, by] = opt(-90), [gx, gy] = opt(-60);
const An = { x: ax, y: ay, r: 34 }, Bn = { x: bx, y: by, r: 24 }, Gn = { x: gx, y: gy, r: 19 };
// ties: A->B strong, B->A weak (nested lanes + port docking), B->G medium
{
  const t1 = orbitTie(ocx, ocy, orx2, ory2, oth(-115), oth(-90), 34, 0.9, An.r, Bn.r, C.S, C.paper);
  const t2 = orbitTie(ocx, ocy, orx2, ory2, oth(-90), oth(-115), 62, 0.45, Bn.r, An.r, C.S, C.paper);
  const t3 = orbitTie(ocx, ocy, orx2, ory2, oth(-90), oth(-60), 34, 0.35, Bn.r, Gn.r, C.S, C.paper);
  o.push(t1.line, t2.line, t3.line, t1.arrow, t2.arrow, t3.arrow);
}
o.push(`</g>`);
// bridge stub from B downward
o.push(`<line x1="${r2(bx)}" y1="${r2(by + Bn.r + 8)}" x2="${r2(bx + 40)}" y2="${oh - 18}" stroke="${C.B}" stroke-width="3.5" opacity="0.45" stroke-linecap="round" stroke-dasharray="1 0"/>`);
// hexes with community rings
o.push(personHex(ax, ay, An.r, 'ML', { ring: '#12B4CF' }));
o.push(personHex(bx, by, Bn.r, 'MC', { ring: '#12B4CF' }));
o.push(personHex(gx, gy, Gn.r, 'DW', { ring: '#A06BF5' }));
o.push(label(ax, ay + An.r + 22, 'Ms Lee', { size: 12.5, weight: 900, fill: '#33434E', anchor: 'middle' }));
o.push(label(bx, by + Bn.r + 22, 'Mr Chan', { size: 12.5, weight: 900, fill: '#33434E', anchor: 'middle' }));
o.push(label(gx + Gn.r + 14, gy - Gn.r - 8, 'Dr Wong', { size: 12.5, weight: 900, fill: '#33434E' }));
// hover card mock for the B->G tie, above the arc
o.push(`<rect x="850" y="120" width="232" height="64" rx="8" fill="#fff" fill-opacity="0.97" stroke="${C.plateFrame}"/>`);
o.push(label(864, 142, 'MC → DW · weight 2.0', { size: 11.5, weight: 900, fill: C.ink }));
o.push(label(864, 160, '3 evidence turns · betweenness 2.0 / 0.0', { size: 10.5, fill: C.muted }));
o.push(label(864, 176, 'click → Inspector with turn excerpts', { size: 10.5, fill: C.faint }));
o.push(`<line x1="920" y1="184" x2="880" y2="222" stroke="${C.faint}" stroke-width="1" opacity="0.6"/>`);
// annotations with leader lines
const anno = (tx, ty, lx1, ly1, text, anchor = 'start') => {
  o.push(`<line x1="${r2(lx1)}" y1="${r2(ly1)}" x2="${r2(tx + (anchor === 'start' ? -6 : 6))}" y2="${r2(ty - 4)}" stroke="${C.faint}" stroke-width="1" opacity="0.6"/>`);
  o.push(label(tx, ty, text, { size: 11.5, weight: 600, fill: C.muted, anchor }));
};
anno(60, 84, ax - An.r * 0.8, ay - An.r * 0.8, 'Size = social strength (√ scale, 18–40 px)');
anno(60, 116, ax - An.r - 6, ay + 6, 'Ring tint = community (label propagation)');
const [m1x, m1y] = opt(-102.5);
anno(330, 46, m1x, m1y - 46, 'Reciprocal ties nest in separate lanes and dock at separate ports — arrowheads never sit on the partner lane');
const [m2x, m2y] = opt(-77);
anno(760, 60, m2x, m2y - 40, 'Arrowhead = direction · width = tie weight on a fixed px scale', 'start');
anno(662, 350, bx + 40, oh - 22, 'Bridges exit toward the ENA plane on selection');
o.push('</svg>');
writeFileSync(new URL('./orbit.svg', import.meta.url), o.join('\n'));

console.log('done: hero.svg comparison.svg orbit.svg');
