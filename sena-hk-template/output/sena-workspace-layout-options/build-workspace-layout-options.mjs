import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

const W = 1920;
const H = 1080;
const teal = "#45b6a5";
const rail = "#202326";
const panel = "#f5f7fa";
const border = "#cfd6dc";
const text = "#1f2937";
const muted = "#6b7280";

function svgShell(title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#111827" flood-opacity="0.14"/>
      </filter>
      <filter id="fine" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#111827" flood-opacity="0.12"/>
      </filter>
      <linearGradient id="railGlassActive" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#68eadb" stop-opacity="0.92"/>
        <stop offset="1" stop-color="#2eb3a4" stop-opacity="0.9"/>
      </linearGradient>
      <linearGradient id="railGlassIdle" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/>
      </linearGradient>
      <filter id="railGlassShadow" x="-35%" y="-35%" width="170%" height="170%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#020617" flood-opacity="0.3"/>
      </filter>
      <style>
        text { font-family: Arial, Helvetica, sans-serif; }
      </style>
    </defs>
    <rect width="${W}" height="${H}" fill="#e6eaee"/>
    <rect x="0" y="0" width="${W}" height="42" fill="#1f1f1f"/>
    <rect x="0" y="40" width="${W}" height="5" fill="${teal}"/>
    <text x="24" y="29" fill="#ffffff" font-size="24" font-weight="900">SENA</text>
    <text x="394" y="28" fill="${teal}" font-size="17" font-weight="900">${title}</text>
    <text x="468" y="28" fill="#f8fafc" font-size="17" font-weight="700">${subtitle}</text>
    ${body}
  </svg>`;
}

function leftRail(active = 0) {
  const items = [
    ["Sets", "DATA"],
    ["Model", "MODEL"],
    ["Plot Tools", "PLOT"],
    ["Stats", "STATS"]
  ];
  return `
    <g>
      <rect x="0" y="45" width="64" height="${H - 45}" fill="${rail}"/>
      <rect x="6" y="57" width="52" height="${H - 86}" rx="26" fill="#ffffff" opacity="0.04"/>
      ${items.map(([label, mini], index) => {
        const y = 78 + index * 86;
        const isActive = index === active;
        const fg = isActive ? "#ffffff" : "#c7ced7";
        return `<g>
          <rect x="7" y="${y - 12}" width="50" height="66" rx="16" fill="${isActive ? "url(#railGlassActive)" : "url(#railGlassIdle)"}" stroke="${isActive ? "#9ffaf0" : "#ffffff"}" stroke-opacity="${isActive ? 0.52 : 0.14}" filter="url(#railGlassShadow)"/>
          <path d="M 18 ${y - 5} C 22 ${y - 10}, 42 ${y - 10}, 46 ${y - 5}" fill="none" stroke="#ffffff" stroke-opacity="${isActive ? 0.54 : 0.18}" stroke-width="1.4"/>
          ${railIcon(mini, 32, y + 7, fg, isActive)}
          <text x="32" y="${y + 40}" text-anchor="middle" fill="${fg}" font-size="${label.length > 8 ? 9 : 10}" font-weight="800">${label}</text>
        </g>`;
      }).join("")}
      <g transform="translate(18 1016)">
        <path d="M0 0h22v22H0z" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <path d="M14 6l8 5-8 5" fill="none" stroke="#cbd5e1" stroke-width="2"/>
      </g>
    </g>`;
}

function railIcon(kind, cx, cy, fg, isActive) {
  const glow = isActive ? `<circle cx="${cx}" cy="${cy}" r="21" fill="#ffffff" opacity="0.14"/>` : "";
  if (kind === "DATA") {
    return `
      <g>
        ${glow}
        <rect x="${cx - 14}" y="${cy - 8}" width="28" height="22" rx="6" fill="none" stroke="${fg}" stroke-width="2.4"/>
        <path d="M ${cx - 9} ${cy - 14} H ${cx + 9}" stroke="${fg}" stroke-width="2.3" stroke-linecap="round"/>
        <path d="M ${cx - 6} ${cy - 19} H ${cx + 6}" stroke="${fg}" stroke-width="1.9" stroke-linecap="round" opacity="0.76"/>
      </g>`;
  }
  if (kind === "MODEL") {
    return `
      <g>
        ${glow}
        <circle cx="${cx}" cy="${cy - 11}" r="4" fill="${fg}"/>
        <circle cx="${cx - 13}" cy="${cy + 8}" r="4" fill="${fg}"/>
        <circle cx="${cx + 13}" cy="${cy + 8}" r="4" fill="${fg}"/>
        <path d="M ${cx - 2} ${cy - 8} L ${cx - 11} ${cy + 4} M ${cx + 2} ${cy - 8} L ${cx + 11} ${cy + 4} M ${cx - 9} ${cy + 8} H ${cx + 9}" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>
        <rect x="${cx - 7}" y="${cy - 1}" width="14" height="12" rx="3.5" fill="none" stroke="${fg}" stroke-opacity="0.78" stroke-width="1.6"/>
      </g>`;
  }
  if (kind === "PLOT") {
    return `
      <g>
        ${glow}
        <path d="M ${cx - 14} ${cy + 13} H ${cx + 15} M ${cx - 13} ${cy + 13} V ${cy - 13}" fill="none" stroke="${fg}" stroke-width="2.3" stroke-linecap="round"/>
        <path d="M ${cx - 9} ${cy + 7} C ${cx - 2} ${cy - 7}, ${cx + 8} ${cy - 2}, ${cx + 13} ${cy - 11}" fill="none" stroke="${fg}" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="${cx - 9}" cy="${cy + 7}" r="2.8" fill="${fg}"/>
        <circle cx="${cx + 3}" cy="${cy - 3}" r="2.8" fill="${fg}"/>
        <circle cx="${cx + 13}" cy="${cy - 11}" r="2.8" fill="${fg}"/>
      </g>`;
  }
  return `
    <g>
      ${glow}
      <path d="M ${cx - 15} ${cy + 13} H ${cx + 15}" stroke="${fg}" stroke-width="2.3" stroke-linecap="round"/>
      <rect x="${cx - 12}" y="${cy - 1}" width="6.5" height="14" rx="2" fill="${fg}" opacity="0.9"/>
      <rect x="${cx - 3}" y="${cy - 9}" width="6.5" height="22" rx="2" fill="${fg}" opacity="0.9"/>
      <rect x="${cx + 6}" y="${cy - 14}" width="6.5" height="27" rx="2" fill="${fg}" opacity="0.9"/>
      <path d="M ${cx - 14} ${cy - 13} C ${cx - 7} ${cy - 21}, ${cx + 5} ${cy - 18}, ${cx + 14} ${cy - 25}" fill="none" stroke="${fg}" stroke-width="1.9" stroke-linecap="round" opacity="0.75"/>
    </g>`;
}

function sectionHeader(x, y, w, label, action = "") {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="32" fill="#d9d9d9"/>
    <text x="${x + 16}" y="${y + 22}" fill="#777" font-size="16" font-weight="900">${label}</text>
    ${action ? `<text x="${x + w - 18}" y="${y + 22}" text-anchor="end" fill="#777" font-size="14" font-weight="800">${action}</text>` : ""}`;
}

function leftInspector(x, y, w, h, title = "SETS") {
  return `
    <g filter="url(#fine)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="${border}"/>
      <text x="${x + 22}" y="${y + 30}" fill="#7c7c7c" font-size="18" font-weight="900">${title}</text>
      <rect x="${x + 22}" y="${y + 62}" width="${w - 44}" height="34" rx="4" fill="${teal}"/>
      <text x="${x + w / 2}" y="${y + 84}" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">Load lesson-study sample</text>
      <text x="${x + 24}" y="${y + 126}" fill="${teal}" font-size="13" font-weight="900">SENA pilot package</text>
      ${["Five-table data contract", "A1 Fusion Canvas model", "Temporal Fusion Arc trace", "Review packet handoff"].map((row, index) => `
        <g transform="translate(${x + 22} ${y + 156 + index * 48})">
          <rect x="0" y="0" width="${w - 44}" height="36" rx="3" fill="${index === 1 ? "#f1fbf8" : "#ffffff"}" stroke="${index === 1 ? teal : "#e5e7eb"}"/>
          <rect x="0" y="0" width="4" height="36" fill="${index === 1 ? teal : "transparent"}"/>
          <text x="16" y="23" fill="${text}" font-size="13" font-weight="${index === 1 ? 900 : 650}">${row}</text>
        </g>`).join("")}
      <line x1="${x}" y1="${y + h - 190}" x2="${x + w}" y2="${y + h - 190}" stroke="#e5e7eb"/>
      <text x="${x + 22}" y="${y + h - 158}" fill="${muted}" font-size="12" font-weight="900">ACTIVE MODEL</text>
      ${metricRows(x + 22, y + h - 132, w - 44, [
        ["People", "4"],
        ["Codes", "7"],
        ["S/W/B/G", "ready"],
        ["A_fusion", "13 x 13"]
      ])}
    </g>`;
}

function metricRows(x, y, w, rows) {
  return rows.map(([label, value], i) => `
    <g transform="translate(${x} ${y + i * 31})">
      <rect x="0" y="0" width="${w}" height="25" rx="4" fill="#f8fafc" stroke="#e5e7eb"/>
      <text x="10" y="17" fill="${muted}" font-size="11" font-weight="800">${label}</text>
      <text x="${w - 10}" y="17" text-anchor="end" fill="${text}" font-size="11" font-weight="900">${value}</text>
    </g>`).join("");
}

function axisPlot(x, y, w, h, label, mode = "fusion") {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const points = [
    [cx - 230, cy - 20, "#cc3b35"], [cx - 160, cy + 120, "#cc3b35"], [cx - 42, cy - 105, "#2483b8"],
    [cx + 120, cy - 20, "#2483b8"], [cx + 210, cy + 90, "#2483b8"], [cx + 40, cy + 150, "#cc3b35"]
  ];
  return `
    <g>
      ${sectionHeader(x, y, w, label, "export")}
      <rect x="${x}" y="${y + 32}" width="${w}" height="${h - 32}" fill="#ffffff" stroke="${border}"/>
      <line x1="${x + 40}" y1="${cy}" x2="${x + w - 40}" y2="${cy}" stroke="#d8dde3"/>
      <line x1="${cx}" y1="${y + 72}" x2="${cx}" y2="${y + h - 44}" stroke="#d8dde3"/>
      <text x="${x + 44}" y="${y + h - 52}" fill="${text}" font-size="13" font-weight="900">Units: teacher group -> name</text>
      <text x="${x + 44}" y="${y + h - 30}" fill="${text}" font-size="13" font-weight="900">Conversation: lesson window -> stage</text>
      ${mode === "fusion" ? fusionMini(cx, cy, 1.08) : ""}
      ${mode === "ena" ? enaMini(cx, cy, 1.1) : ""}
      ${mode === "sna" ? snaMini(cx, cy, 1.0) : ""}
      ${points.map(([px, py, color]) => `<circle cx="${px}" cy="${py}" r="5" fill="${color}" opacity="0.94"/>`).join("")}
    </g>`;
}

function miniPlot(x, y, w, h, label, type) {
  return `
    <g filter="url(#fine)">
      ${sectionHeader(x, y, w, label)}
      <rect x="${x}" y="${y + 32}" width="${w}" height="${h - 32}" fill="#ffffff" stroke="${border}"/>
      <line x1="${x + 28}" y1="${y + h / 2}" x2="${x + w - 28}" y2="${y + h / 2}" stroke="#e1e5ea"/>
      <line x1="${x + w / 2}" y1="${y + 62}" x2="${x + w / 2}" y2="${y + h - 30}" stroke="#e1e5ea"/>
      ${type === "ena" ? enaMini(x + w / 2, y + h / 2 + 14, 0.62) : ""}
      ${type === "sna" ? snaMini(x + w / 2, y + h / 2 + 14, 0.62) : ""}
      ${type === "temporal" ? temporalMini(x + 34, y + 64, w - 68, h - 104) : ""}
      ${type === "matrix" ? matrixMini(x + 48, y + 74, w - 96, h - 124) : ""}
      ${type === "evidence" ? evidenceMini(x + 34, y + 62, w - 68, h - 98) : ""}
    </g>`;
}

function fusionMini(cx, cy, s = 1) {
  const c = [
    ["Q", -18, -116, "#7048e8"], ["H", 112, -58, "#7b5cf4"], ["E", 138, 55, "#2f68df"],
    ["X", 42, 138, "#cc39e4"], ["C", -106, 130, "#f97316"], ["R", -168, 36, "#e3428b"], ["Co", -142, -64, "#16b8b2"]
  ];
  const p = [["ML", 0, -215], ["MC", 300, -5], ["DW", 0, 230], ["MH", -300, -5]];
  const pt = (x, y) => [cx + x * s, cy + y * s];
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${320 * s}" ry="${245 * s}" fill="none" stroke="#3f7df4" stroke-width="${8 * s}" opacity="0.85"/>
    ${[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3],[2,4],[3,4]].map(([a,b]) => {
      const [x1,y1] = pt(c[a][1], c[a][2]); const [x2,y2] = pt(c[b][1], c[b][2]);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${10*s}" stroke-linecap="round"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7c3aed" stroke-width="${5*s}" stroke-linecap="round" opacity="0.86"/>`;
    }).join("")}
    ${c.map(([label, x, y, color]) => {
      const [px,py] = pt(x,y);
      return `<g><circle cx="${px}" cy="${py}" r="${24*s}" fill="${color}" stroke="#ffffff" stroke-width="${4*s}"/>
        <rect x="${px-32*s}" y="${py+28*s}" width="${64*s}" height="${20*s}" rx="${10*s}" fill="#ffffff" stroke="#d7dde5"/>
        <text x="${px}" y="${py+42*s}" text-anchor="middle" fill="${text}" font-size="${10*s}" font-weight="900">${label}</text></g>`;
    }).join("")}
    ${p.map(([label,x,y]) => {
      const [px,py] = pt(x,y);
      return `<g><circle cx="${px}" cy="${py}" r="${35*s}" fill="#f8fbff" stroke="#22d3ee" stroke-width="${3*s}"/>
        <text x="${px}" y="${py+6*s}" text-anchor="middle" fill="#0f172a" font-size="${18*s}" font-weight="900">${label}</text></g>`;
    }).join("")}`;
}

function enaMini(cx, cy, s = 1) {
  return `
    <g opacity="0.95">
      <line x1="${cx-140*s}" y1="${cy+20*s}" x2="${cx+150*s}" y2="${cy-20*s}" stroke="#7c3aed" stroke-width="${4*s}" stroke-linecap="round"/>
      <line x1="${cx-90*s}" y1="${cy-80*s}" x2="${cx+50*s}" y2="${cy+100*s}" stroke="#7c3aed" stroke-width="${3*s}" stroke-linecap="round"/>
      <circle cx="${cx-120*s}" cy="${cy+28*s}" r="${5*s}" fill="#cc3b35"/>
      <circle cx="${cx-42*s}" cy="${cy-64*s}" r="${5*s}" fill="#cc3b35"/>
      <circle cx="${cx+62*s}" cy="${cy+34*s}" r="${5*s}" fill="#2483b8"/>
      <circle cx="${cx+132*s}" cy="${cy-36*s}" r="${5*s}" fill="#2483b8"/>
      <rect x="${cx-16*s}" y="${cy-16*s}" width="${32*s}" height="${32*s}" fill="none" stroke="#cc3b35" stroke-dasharray="${7*s} ${7*s}" stroke-width="${2*s}"/>
      <rect x="${cx+32*s}" y="${cy-12*s}" width="${32*s}" height="${32*s}" fill="none" stroke="#2483b8" stroke-dasharray="${7*s} ${7*s}" stroke-width="${2*s}"/>
      <text x="${cx-130*s}" y="${cy+130*s}" fill="${text}" font-size="${12*s}" font-weight="900">ENA comparison</text>
    </g>`;
}

function snaMini(cx, cy, s = 1) {
  const nodes = [[0,-90,"ML"],[120,0,"MC"],[0,96,"DW"],[-120,0,"MH"]];
  const edges = [[0,1],[1,2],[2,3],[3,0],[0,2]];
  return `
    <g>
      ${edges.map(([a,b]) => {
        const A = nodes[a], B = nodes[b];
        return `<line x1="${cx+A[0]*s}" y1="${cy+A[1]*s}" x2="${cx+B[0]*s}" y2="${cy+B[1]*s}" stroke="#3f7df4" stroke-width="${5*s}" stroke-linecap="round" opacity="0.72"/>`;
      }).join("")}
      ${nodes.map(([x,y,label]) => `<g><circle cx="${cx+x*s}" cy="${cy+y*s}" r="${24*s}" fill="#f8fbff" stroke="#22d3ee" stroke-width="${3*s}"/>
        <text x="${cx+x*s}" y="${cy+y*s+5*s}" text-anchor="middle" fill="#0f172a" font-size="${12*s}" font-weight="900">${label}</text></g>`).join("")}
      <text x="${cx-118*s}" y="${cy+138*s}" fill="${text}" font-size="${12*s}" font-weight="900">SNA social graph</text>
    </g>`;
}

function temporalMini(x, y, w, h) {
  const phases = [["Plan", "#7048e8"], ["Teach", "#2f68df"], ["Reflect", "#e3428b"]];
  return phases.map(([label, color], i) => {
    const px = x + i * (w / 3) + 16;
    const pw = w / 3 - 22;
    return `<g>
      <rect x="${px}" y="${y+18}" width="${pw}" height="${h-36}" rx="18" fill="#f8fbff" stroke="#dce3eb"/>
      <text x="${px+18}" y="${y+48}" fill="${text}" font-size="13" font-weight="900">${label}</text>
      <circle cx="${px+pw/2}" cy="${y+h/2+8}" r="26" fill="${color}" stroke="#ffffff" stroke-width="4"/>
      <path d="M ${px+20} ${y+h-40} C ${px+pw/2} ${y+h-80}, ${px+pw/2} ${y+h-10}, ${px+pw-20} ${y+h-54}" fill="none" stroke="#22c7d9" stroke-width="5" opacity="0.62"/>
    </g>`;
  }).join("");
}

function matrixMini(x, y, w, h) {
  const n = 7;
  const cell = Math.min(w, h) / n;
  return Array.from({ length: n * n }, (_, index) => {
    const r = Math.floor(index / n);
    const c = index % n;
    const on = (r + c) % 3 === 0 || r === c;
    const color = r < 3 && c < 3 ? "#3f7df4" : r >= 3 && c >= 3 ? "#7c3aed" : "#22c7d9";
    return `<rect x="${x+c*cell}" y="${y+r*cell}" width="${cell-2}" height="${cell-2}" fill="${on ? color : "#eef2f7"}" opacity="${on ? 0.82 : 1}"/>`;
  }).join("");
}

function evidenceMini(x, y, w, h) {
  const rows = [
    ["table=coded_segments", "Evidence + Explanation"],
    ["person=MC", "Mr Chan contributes evidence"],
    ["window=Teach", "A_fusion checksum 0x..."]
  ];
  return rows.map(([meta, label], i) => `
    <g transform="translate(${x} ${y + i * 58})">
      <rect x="0" y="0" width="${w}" height="44" rx="8" fill="#f8fbff" stroke="#dde4ec"/>
      <text x="14" y="18" fill="${text}" font-size="12" font-weight="900">${label}</text>
      <text x="14" y="34" fill="${muted}" font-size="10" font-weight="800">${meta}</text>
    </g>`).join("");
}

function bottomDataTray(x, y, w, h, label = "Data View") {
  return `
    <g filter="url(#fine)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#202326"/>
      <text x="${x + w / 2}" y="${y + 28}" text-anchor="middle" fill="#e5e7eb" font-size="16" font-weight="800">${label}</text>
      <text x="${x + 26}" y="${y + 58}" fill="#b7c0c8" font-size="12" font-weight="700">utterances | coded_segments | interactions | evidence ledger | runtime fingerprints</text>
    </g>`;
}

function plotTabs(x, y, selected = 0) {
  const tabs = ["Fusion", "ENA Space", "SNA", "Temporal", "Evidence", "Matrix"];
  return `
    <g>
      ${tabs.map((tab, i) => {
        const tx = x + i * 108;
        const active = i === selected;
        return `<g>
          <rect x="${tx}" y="${y}" width="96" height="32" rx="16" fill="${active ? teal : "#ffffff"}" stroke="${active ? teal : "#d5dce5"}"/>
          <text x="${tx+48}" y="${y+21}" text-anchor="middle" fill="${active ? "#ffffff" : text}" font-size="12" font-weight="900">${tab}</text>
        </g>`;
      }).join("")}
    </g>`;
}

function collapsedPlotSwitcher(x, y, selected = "Temporal") {
  return `
    <g>
      <rect x="${x}" y="${y}" width="254" height="46" rx="23" fill="#ffffff" stroke="#cfd8e3" stroke-width="2"/>
      <g transform="translate(${x + 22} ${y + 13})">
        <rect x="0" y="0" width="8" height="8" rx="2" fill="${teal}"/>
        <rect x="12" y="0" width="8" height="8" rx="2" fill="#7c3aed"/>
        <rect x="0" y="12" width="8" height="8" rx="2" fill="#3f7df4"/>
        <rect x="12" y="12" width="8" height="8" rx="2" fill="#e3428b"/>
      </g>
      <text x="${x + 62}" y="${y + 29}" fill="${text}" font-size="14" font-weight="900">Plots</text>
      <text x="${x + 118}" y="${y + 29}" fill="${muted}" font-size="13" font-weight="800">${selected}</text>
      <rect x="${x + 194}" y="${y + 10}" width="26" height="26" rx="13" fill="#eefaf8" stroke="#cbe9e5"/>
      <text x="${x + 207}" y="${y + 28}" text-anchor="middle" fill="${teal}" font-size="12" font-weight="900">6</text>
      <path d="M ${x + 232} ${y + 21} l5 5 l5 -5" fill="none" stroke="${teal}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
}

function optionA() {
  return svgShell("A1", "- SENA Plot Workbench", `
    ${leftRail(0)}
    ${leftInspector(64, 45, 320, 1015, "SETS")}
    ${axisPlot(404, 72, 1056, 792, "FUSION COMPARISON PLOT", "fusion")}
    ${miniPlot(1474, 72, 420, 386, "PRIMARY PLOT - ENA SPACE", "ena")}
    ${miniPlot(1474, 506, 420, 386, "SECONDARY PLOT - TEMPORAL ARC", "temporal")}
    ${bottomDataTray(404, 892, 1056, 168, "Data View")}
  `);
}

function optionB() {
  return svgShell("B2", "- Multi-Plot Research Console", `
    ${leftRail(2)}
    ${leftInspector(64, 45, 284, 1015, "PLOT TOOLS")}
    <g filter="url(#fine)">
      <rect x="372" y="72" width="1180" height="776" fill="#ffffff" stroke="${border}"/>
      ${sectionHeader(372, 72, 1180, "PRIMARY PLOT DECK - FUSION CANVAS")}
      ${plotTabs(406, 116, 0)}
      ${fusionMini(962, 482, 1.32)}
      <rect x="402" y="780" width="1118" height="42" rx="8" fill="#f8fafc" stroke="#e5e7eb"/>
      <text x="424" y="807" fill="${text}" font-size="13" font-weight="900">Plot mode:</text>
      <text x="506" y="807" fill="${muted}" font-size="13" font-weight="800">Fusion / ENA / SNA / Temporal / Evidence / Matrix, with the same selected edge synchronized across views.</text>
    </g>
    ${miniPlot(1572, 72, 322, 250, "VIEW 1 - SNA", "sna")}
    ${miniPlot(1572, 352, 322, 250, "VIEW 2 - MATRIX", "matrix")}
    ${miniPlot(1572, 632, 322, 250, "VIEW 3 - EVIDENCE", "evidence")}
    ${bottomDataTray(372, 884, 1180, 176, "Synchronized Data View")}
  `);
}

function optionC() {
  return svgShell("C3", "- Temporal Fusion Studio", `
    ${leftRail(2)}
    ${leftInspector(64, 45, 304, 1015, "MODEL")}
    <g filter="url(#fine)">
      ${sectionHeader(392, 72, 1098, "TEMPORAL FUSION PLOT - PLAN / TEACH / REFLECT", "playback")}
      <rect x="392" y="104" width="1098" height="744" fill="#ffffff" stroke="${border}"/>
      ${temporalMini(442, 160, 998, 500)}
      <path d="M 482 740 C 690 684, 950 812, 1360 720" fill="none" stroke="#3f7df4" stroke-width="8" stroke-linecap="round" opacity="0.5"/>
      <rect x="462" y="702" width="902" height="86" rx="18" fill="#f8fbff" stroke="#dce3eb"/>
      <text x="494" y="734" fill="${text}" font-size="15" font-weight="900">Temporal scrubber</text>
      <text x="494" y="762" fill="${muted}" font-size="13" font-weight="800">Stage, moving-window, and turn-window views keep A_fusion checksum and top G pair visible per window.</text>
      ${plotTabs(494, 806, 3)}
    </g>
    ${miniPlot(1510, 72, 384, 386, "PRIMARY PLOT - FUSION A1", "fusion")}
    ${miniPlot(1510, 506, 384, 386, "SECONDARY PLOT - EVIDENCE", "evidence")}
    ${bottomDataTray(392, 892, 1098, 168, "Temporal Runtime Trace")}
  `);
}

function optionC2() {
  return svgShell("C3", "- Temporal Fusion Studio / Collapsed Plot Switcher", `
    ${leftRail(2)}
    ${leftInspector(64, 45, 304, 1015, "MODEL")}
    <g filter="url(#fine)">
      ${sectionHeader(392, 72, 1098, "TEMPORAL FUSION PLOT - PLAN / TEACH / REFLECT", "playback")}
      <rect x="392" y="104" width="1098" height="744" fill="#ffffff" stroke="${border}"/>
      <rect x="424" y="126" width="1034" height="42" rx="21" fill="#f8fbff" stroke="#dde5ef"/>
      <text x="450" y="153" fill="${text}" font-size="14" font-weight="900">Active view</text>
      <text x="540" y="153" fill="${teal}" font-size="14" font-weight="900">Temporal Fusion Arc</text>
      <text x="692" y="153" fill="${muted}" font-size="13" font-weight="800">Plan -> Teach -> Reflect, synchronized with Fusion A1 and evidence windows</text>
      ${collapsedPlotSwitcher(1174, 124, "Temporal")}
      ${temporalMini(442, 184, 998, 480)}
      <path d="M 482 740 C 690 684, 950 812, 1360 720" fill="none" stroke="#3f7df4" stroke-width="8" stroke-linecap="round" opacity="0.5"/>
      <rect x="462" y="702" width="902" height="86" rx="18" fill="#f8fbff" stroke="#dce3eb"/>
      <text x="494" y="734" fill="${text}" font-size="15" font-weight="900">Temporal scrubber</text>
      <text x="494" y="762" fill="${muted}" font-size="13" font-weight="800">Stage, moving-window, and turn-window views keep A_fusion checksum and top G pair visible per window.</text>
      <g transform="translate(1188 718)">
        <rect x="0" y="0" width="142" height="42" rx="21" fill="${teal}" stroke="${teal}"/>
        <text x="71" y="27" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="900">Open plots</text>
      </g>
    </g>
    ${miniPlot(1510, 72, 384, 386, "PRIMARY PLOT - FUSION A1", "fusion")}
    ${miniPlot(1510, 506, 384, 386, "SECONDARY PLOT - EVIDENCE", "evidence")}
    ${bottomDataTray(392, 892, 1098, 168, "Temporal Runtime Trace")}
  `);
}

const options = [
  ["sena-workspace-layout-option-a-ena-workbench", optionA()],
  ["sena-workspace-layout-option-b-multi-plot-console", optionB()],
  ["sena-workspace-layout-option-c-temporal-studio", optionC()],
  ["sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher", optionC2()]
];

for (const [name, svg] of options) {
  writeFileSync(join(outDir, `${name}.svg`), svg);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const [name, svg] of options) {
  const pngPath = join(outDir, `${name}.png`);
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/><style>html,body{width:${W}px;height:${H}px;margin:0;overflow:hidden;background:#e6eaee}</style></head><body>${svg}</body></html>`);
  await page.screenshot({ path: pngPath, fullPage: false });
  console.log(pngPath);
}

await browser.close();
