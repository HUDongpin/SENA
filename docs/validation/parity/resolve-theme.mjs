// The component emits `rgb(var(--token))` colours; a standalone rasterizer
// cannot resolve those, so substitute the theme tokens literally and emit one
// self-contained SVG per theme for rsvg-convert.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, "plot.svg"), "utf8");

const themes = {
  light: { background: "229 240 239", foreground: "13 21 38", muted: "67 83 105" },
  dark: { background: "8 25 23", foreground: "237 246 255", muted: "166 198 191" }
};

for (const [name, tokens] of Object.entries(themes)) {
  const resolved = svg.replace(/rgb\(var\(--([a-z-]+)\)(?:\s*\/\s*([0-9.]+))?\)/g, (_match, token, alpha) => {
    const value = tokens[token];
    if (!value) return "rgb(0,0,0)";
    const channels = value.split(" ").join(",");
    return alpha ? `rgba(${channels},${alpha})` : `rgb(${channels})`;
  });
  const framed = resolved.replace(
    "<desc>",
    `<rect x="0" y="0" width="720" height="520" fill="rgb(${tokens.background.split(" ").join(",")})"/><desc>`
  );
  writeFileSync(join(here, `plot-${name}.svg`), framed);
  console.log(`wrote plot-${name}.svg`);
}
