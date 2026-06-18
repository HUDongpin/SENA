import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const rDir = join(root, "reference", "r-sna-2.8", "R");
const outPath = join(root, "docs", "FUNCTION_INVENTORY.generated.md");
const functionPattern = /^([A-Za-z.][A-Za-z0-9._]*)\s*<-\s*function\s*\(/gm;
const implementedStarter = new Set(["betweenness", "closeness", "components", "degree", "gden", "geodist", "grecip", "is.connected", "nties", "reachability"]);

const rows = [];
for (const file of readdirSync(rDir).filter((name) => name.endsWith(".R")).sort()) {
  const content = readFileSync(join(rDir, file), "utf8");
  for (const match of content.matchAll(functionPattern)) {
    rows.push({ file, name: match[1] });
  }
}

const lines = [
  "# Generated R function inventory",
  "",
  "Regenerate with `npm run inventory`.",
  "",
  "| R file | Function | JS status | Notes |",
  "|---|---:|---|---|",
];
for (const row of rows) {
  const status = implementedStarter.has(row.name) ? "implemented-starter" : "pending";
  lines.push(`| \`${row.file}\` | \`${row.name}\` | ${status} | |`);
}

writeFileSync(outPath, `${lines.join("\n")}\n`);
console.log(`Wrote ${rows.length} functions to ${outPath}`);
