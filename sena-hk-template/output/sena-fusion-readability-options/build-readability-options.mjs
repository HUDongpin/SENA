import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

const people = [
  { id: "ML", name: "Ms Lee", x: 800, y: 125 },
  { id: "MC", name: "Mr Chan", x: 1300, y: 445 },
  { id: "DW", name: "Dr Wong", x: 800, y: 760 },
  { id: "MH", name: "Ms Ho", x: 300, y: 445 }
];

const concepts = [
  { id: "Question", x: 800, y: 260, color: "#7048e8", glyph: "?" },
  { id: "Hypothesis", x: 970, y: 330, color: "#7b5cf4", glyph: "H" },
  { id: "Evidence", x: 1015, y: 500, color: "#2f68df", glyph: "E" },
  { id: "Explanation", x: 895, y: 640, color: "#cc39e4", glyph: "X" },
  { id: "Critique", x: 705, y: 640, color: "#f97316", glyph: "C" },
  { id: "Reflection", x: 600, y: 500, color: "#e3428b", glyph: "R" },
  { id: "Coordination", x: 640, y: 330, color: "#16b8b2", glyph: "Co" }
];

const conceptById = new Map(concepts.map((item) => [item.id, item]));
const personById = new Map(people.map((item) => [item.id, item]));

const wLinks = [
  ["Question", "Hypothesis", 9],
  ["Question", "Evidence", 8],
  ["Question", "Explanation", 7],
  ["Question", "Critique", 7],
  ["Hypothesis", "Evidence", 9],
  ["Hypothesis", "Explanation", 6],
  ["Hypothesis", "Critique", 5],
  ["Evidence", "Explanation", 8],
  ["Evidence", "Critique", 6],
  ["Critique", "Explanation", 6]
];

const bLinks = [
  ["ML", "Question", 7],
  ["MC", "Evidence", 6],
  ["DW", "Explanation", 7],
  ["DW", "Critique", 5],
  ["MH", "Coordination", 4],
  ["MC", "Hypothesis", 4]
];

const sLinks = [
  ["ML", "MC", 10],
  ["MC", "DW", 8],
  ["DW", "MH", 5],
  ["MH", "ML", 5],
  ["ML", "DW", 6]
];

function line(a, b, color, width, opacity = 1, extra = "") {
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}" ${extra}/>`;
}

function curve(a, b, bend, color, width, opacity = 1, extra = "") {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.y - a.y;
  const dy = a.x - b.x;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (dx / len) * bend;
  const cy = my + (dy / len) * bend;
  return `<path d="M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}" ${extra}/>`;
}

function hexPath(x, y, r = 54) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 6 + index * Math.PI / 3;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(" ") + " Z";
}

function grid() {
  const vertical = Array.from({ length: 14 }, (_, i) => {
    const x = 120 + i * 105;
    return `<line x1="${x}" y1="40" x2="${x}" y2="860" stroke="#d8e2f1" stroke-width="1" opacity="0.55"/>`;
  }).join("");
  const horizontal = Array.from({ length: 8 }, (_, i) => {
    const y = 85 + i * 105;
    return `<line x1="90" y1="${y}" x2="1510" y2="${y}" stroke="#d8e2f1" stroke-width="1" opacity="0.55"/>`;
  }).join("");
  return `<g>${vertical}${horizontal}</g>`;
}

function titleBlock(title, subtitle) {
  return `
    <g transform="translate(68 48)">
      <rect x="0" y="0" width="540" height="62" rx="14" fill="#ffffff" stroke="#d8e2f1"/>
      <text x="22" y="27" font-size="21" font-weight="800" fill="#0f172a">${title}</text>
      <text x="22" y="49" font-size="13" font-weight="650" fill="#475569">${subtitle}</text>
    </g>`;
}

function legend(x = 1110, y = 52) {
  const rows = [
    ["S", "#3777f6", "SNA outer social arcs"],
    ["W", "#7c3aed", "solid ENA concept mesh"],
    ["B", "#28c8dd", "person-code bridge"],
    ["G", "#e85aa8", "low-emphasis contribution"]
  ];
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="380" height="112" rx="16" fill="#ffffff" stroke="#d7e0ee"/>
      ${rows.map((row, i) => `
        <g transform="translate(18 ${24 + i * 22})">
          <line x1="0" y1="0" x2="34" y2="0" stroke="${row[1]}" stroke-width="${row[0] === "S" ? 8 : 5}" stroke-linecap="round"/>
          <text x="48" y="5" font-size="13" font-weight="800" fill="#0f172a">${row[0]}</text>
          <text x="75" y="5" font-size="13" font-weight="600" fill="#475569">${row[2]}</text>
        </g>`).join("")}
    </g>`;
}

function personNode(person, mode = "plate") {
  const plateY = person.y + 60;
  const plateWidth = Math.max(106, person.name.length * 9 + 34);
  const plateX = person.x - plateWidth / 2;
  const ring = mode === "minimal" ? "#60a5fa" : "#22d3ee";
  return `
    <g>
      <circle cx="${person.x}" cy="${person.y}" r="58" fill="#f8fbff" stroke="#ffffff" stroke-width="12"/>
      <circle cx="${person.x}" cy="${person.y}" r="58" fill="#f8fbff" stroke="${ring}" stroke-width="4"/>
      <text x="${person.x}" y="${person.y + 10}" text-anchor="middle" font-size="30" font-weight="900" fill="#0f172a">${person.id}</text>
      <rect x="${plateX}" y="${plateY}" width="${plateWidth}" height="34" rx="17" fill="#ffffff" stroke="#d6e1ef"/>
      <text x="${person.x}" y="${plateY + 23}" text-anchor="middle" font-size="18" font-weight="850" fill="#111827">${person.name}</text>
    </g>`;
}

function conceptNode(concept, variant = "plate") {
  if (variant === "tag") {
    const width = Math.max(124, concept.id.length * 10 + 44);
    return `
      <g>
        <path d="${hexPath(concept.x - width / 2 + 34, concept.y, 34)}" fill="${concept.color}" stroke="#ffffff" stroke-width="5"/>
        <rect x="${concept.x - width / 2 + 22}" y="${concept.y - 22}" width="${width}" height="44" rx="13" fill="#ffffff" stroke="#d8e2f1"/>
        <rect x="${concept.x - width / 2 + 22}" y="${concept.y - 22}" width="8" height="44" rx="4" fill="${concept.color}"/>
        <text x="${concept.x - width / 2 + 48}" y="${concept.y + 7}" font-size="18" font-weight="850" fill="#0f172a">${concept.id}</text>
      </g>`;
  }
  const labelWidth = Math.max(110, concept.id.length * 9 + 24);
  return `
    <g>
      <path d="${hexPath(concept.x, concept.y, 49)}" fill="${concept.color}" stroke="#ffffff" stroke-width="6"/>
      <path d="${hexPath(concept.x, concept.y, 52)}" fill="none" stroke="#c7d2fe" stroke-width="2"/>
      <text x="${concept.x}" y="${concept.y + 8}" text-anchor="middle" font-size="${concept.glyph.length > 1 ? 18 : 28}" font-weight="900" fill="#ffffff">${concept.glyph}</text>
      <rect x="${concept.x - labelWidth / 2}" y="${concept.y + 58}" width="${labelWidth}" height="32" rx="16" fill="#ffffff" stroke="#d8e2f1"/>
      <text x="${concept.x}" y="${concept.y + 80}" text-anchor="middle" font-size="16" font-weight="850" fill="#111827">${concept.id}</text>
    </g>`;
}

function whiteHaloLines(links, color, scale = 1) {
  return links.map(([aId, bId, w]) => {
    const a = conceptById.get(aId);
    const b = conceptById.get(bId);
    return `
      ${line(a, b, "#ffffff", w * scale + 8, 0.94)}
      ${line(a, b, color, w * scale, 0.86)}`;
  }).join("");
}

function bridgeLines(opacity = 0.76) {
  return bLinks.map(([pId, cId, w]) => {
    const p = personById.get(pId);
    const c = conceptById.get(cId);
    return `
      ${curve(p, c, p.x < c.x ? -55 : 55, "#ffffff", w + 8, 0.75)}
      ${curve(p, c, p.x < c.x ? -55 : 55, "#2bcce3", w, opacity)}`;
  }).join("");
}

function socialArcs(opacity = 0.9, widthBias = 0) {
  return sLinks.map(([aId, bId, w], index) => {
    const a = personById.get(aId);
    const b = personById.get(bId);
    const bend = [130, 130, 90, 92, -40][index] ?? 80;
    return `
      ${curve(a, b, bend, "#ffffff", w + 8 + widthBias, 0.88)}
      ${curve(a, b, bend, "#3f7df4", w + widthBias, opacity)}`;
  }).join("");
}

function backgroundDefs() {
  return `
    <defs>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#334155" flood-opacity="0.16"/>
      </filter>
      <filter id="thinShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#334155" flood-opacity="0.14"/>
      </filter>
      <linearGradient id="canvasBg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#f8fbff"/>
        <stop offset="1" stop-color="#eef4fb"/>
      </linearGradient>
    </defs>`;
}

function shell(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    ${backgroundDefs()}
    <style>
      text { font-family: Arial, Helvetica, sans-serif; }
    </style>
    <rect width="1600" height="900" fill="url(#canvasBg)"/>
    ${grid()}
    ${body}
  </svg>`;
}

function optionOne() {
  const body = `
    ${titleBlock("Option 1 - Label Plate Canvas", "Keep A1 layout; add opaque labels, white halos, and stronger solid W mesh.")}
    ${legend()}
    <ellipse cx="800" cy="475" rx="365" ry="315" fill="#ffffff" opacity="0.32" stroke="#b9a7ff" stroke-width="2" stroke-dasharray="12 16"/>
    <g opacity="0.98">${socialArcs(0.95, 2)}</g>
    <g>${bridgeLines(0.70)}</g>
    <g>${whiteHaloLines(wLinks, "#7c3aed", 0.82)}</g>
    <g filter="url(#thinShadow)">${concepts.map((concept) => conceptNode(concept)).join("")}</g>
    <g filter="url(#thinShadow)">${people.map((person) => personNode(person)).join("")}</g>
    <g transform="translate(68 786)">
      <rect width="520" height="58" rx="14" fill="#ffffff" stroke="#d8e2f1"/>
      <text x="20" y="25" font-size="15" font-weight="850" fill="#0f172a">Design move</text>
      <text x="118" y="25" font-size="14" font-weight="650" fill="#475569">Concept names move to readable plates. Lines use white halo underlay.</text>
      <text x="118" y="45" font-size="14" font-weight="650" fill="#475569">Best if we want the smallest implementation change.</text>
    </g>`;
  return shell(body);
}

function optionTwo() {
  const shiftedConcepts = concepts.map((item) => ({ ...item, x: item.x + (item.id === "Coordination" ? -20 : item.id === "Reflection" ? -16 : 0) }));
  const shiftedMap = new Map(shiftedConcepts.map((item) => [item.id, item]));
  const w = wLinks.map(([aId, bId, width]) => {
    const a = shiftedMap.get(aId);
    const b = shiftedMap.get(bId);
    return `${line(a, b, "#ffffff", width + 10, 0.95)}${line(a, b, "#6d28d9", width, 0.88)}`;
  }).join("");
  const body = `
    ${titleBlock("Option 2 - Research Plate", "Separate the ENA plane from social arcs; use dark text tags beside color marks.")}
    ${legend()}
    <g filter="url(#softShadow)">
      <rect x="455" y="185" width="690" height="590" rx="34" fill="#ffffff" stroke="#dbe5f2"/>
      <rect x="483" y="216" width="634" height="528" rx="26" fill="#f8fbff" stroke="#e4eaf5"/>
      <text x="520" y="250" font-size="13" font-weight="850" fill="#64748b">INNER ENA PLATE - solid W links</text>
    </g>
    <g opacity="0.78">${socialArcs(0.74, 0)}</g>
    <g opacity="0.72">${bridgeLines(0.64)}</g>
    <g>${w}</g>
    <g filter="url(#thinShadow)">${shiftedConcepts.map((concept) => conceptNode(concept, "tag")).join("")}</g>
    <g filter="url(#thinShadow)">${people.map((person) => personNode(person, "minimal")).join("")}</g>
    <g transform="translate(68 786)">
      <rect width="570" height="58" rx="14" fill="#ffffff" stroke="#d8e2f1"/>
      <text x="20" y="25" font-size="15" font-weight="850" fill="#0f172a">Design move</text>
      <text x="118" y="25" font-size="14" font-weight="650" fill="#475569">A visible white ENA plate makes purple concept links readable in day mode.</text>
      <text x="118" y="45" font-size="14" font-weight="650" fill="#475569">Best if dense concept meshes need publication-like clarity.</text>
    </g>`;
  return shell(body);
}

function optionThree() {
  const focus = new Set(["Evidence", "Explanation", "Question", "MC", "DW"]);
  const mutedW = wLinks.map(([aId, bId, w]) => {
    const a = conceptById.get(aId);
    const b = conceptById.get(bId);
    const active = (aId === "Evidence" && bId === "Explanation") || (aId === "Question" && bId === "Evidence") || (aId === "Question" && bId === "Explanation");
    return active
      ? `${line(a, b, "#ffffff", w + 13, 0.96)}${line(a, b, "#5b21b6", w + 2, 0.95)}`
      : `${line(a, b, "#ffffff", 5, 0.8)}${line(a, b, "#8b5cf6", 3, 0.24)}`;
  }).join("");
  const mutedB = bLinks.map(([pId, cId, w]) => {
    const p = personById.get(pId);
    const c = conceptById.get(cId);
    const active = (pId === "MC" && cId === "Evidence") || (pId === "DW" && cId === "Explanation");
    return active
      ? `${curve(p, c, p.x < c.x ? -55 : 55, "#ffffff", w + 12, 0.96)}${curve(p, c, p.x < c.x ? -55 : 55, "#0891b2", w + 2, 0.9)}`
      : `${curve(p, c, p.x < c.x ? -55 : 55, "#ffffff", 6, 0.82)}${curve(p, c, p.x < c.x ? -55 : 55, "#28c8dd", 3, 0.20)}`;
  }).join("");
  const body = `
    ${titleBlock("Option 3 - Focus + Context Lens", "Default context stays muted; selected evidence path gets strong labels and lines.")}
    ${legend()}
    <ellipse cx="800" cy="475" rx="382" ry="318" fill="#ffffff" opacity="0.42" stroke="#cbd5e1" stroke-width="2"/>
    <g opacity="0.28">${socialArcs(0.56, -2)}</g>
    <g>${mutedB}</g>
    <g>${mutedW}</g>
    <g filter="url(#thinShadow)">
      ${concepts.map((concept) => {
        const opacity = focus.has(concept.id) ? 1 : 0.42;
        return `<g opacity="${opacity}">${conceptNode(concept)}</g>`;
      }).join("")}
    </g>
    <g filter="url(#thinShadow)">
      ${people.map((person) => {
        const opacity = focus.has(person.id) ? 1 : 0.48;
        return `<g opacity="${opacity}">${personNode(person)}</g>`;
      }).join("")}
    </g>
    <g filter="url(#softShadow)">
      <rect x="1046" y="642" width="398" height="132" rx="20" fill="#ffffff" stroke="#d8e2f1"/>
      <text x="1072" y="676" font-size="16" font-weight="900" fill="#0f172a">Focus path</text>
      <text x="1072" y="704" font-size="22" font-weight="900" fill="#111827">Evidence -> Explanation</text>
      <text x="1072" y="732" font-size="14" font-weight="650" fill="#475569">Show top W link, active B contributors, and dim unrelated context.</text>
      <text x="1072" y="756" font-size="14" font-weight="650" fill="#475569">Best for inspection and presentations.</text>
    </g>
    <g transform="translate(68 786)">
      <rect width="620" height="58" rx="14" fill="#ffffff" stroke="#d8e2f1"/>
      <text x="20" y="25" font-size="15" font-weight="850" fill="#0f172a">Design move</text>
      <text x="118" y="25" font-size="14" font-weight="650" fill="#475569">Interaction solves density: selected node/edge gets high contrast, others remain context.</text>
      <text x="118" y="45" font-size="14" font-weight="650" fill="#475569">Best if researchers inspect evidence paths one by one.</text>
    </g>`;
  return shell(body);
}

const options = [
  ["sena-fusion-readability-option-1-label-plates", optionOne()],
  ["sena-fusion-readability-option-2-research-plate", optionTwo()],
  ["sena-fusion-readability-option-3-focus-context", optionThree()]
];

for (const [name, svg] of options) {
  const svgPath = join(outDir, `${name}.svg`);
  writeFileSync(svgPath, svg);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

for (const [name, svg] of options) {
  const pngPath = join(outDir, `${name}.png`);
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { width: 1600px; height: 900px; margin: 0; overflow: hidden; background: #eef4fb; }
          img { display: block; width: 1600px; height: 900px; }
        </style>
      </head>
      <body>
        ${svg}
      </body>
    </html>
  `);
  await page.screenshot({ path: pngPath, fullPage: false });
  console.log(pngPath);
}

await browser.close();
