import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("SENA navigation control styling", () => {
  it("uses compact MAIS-style controls for language, auth, and theme switching", () => {
    const navSource = readProjectFile("components/NavBar.tsx");

    expect(navSource).toContain('data-testid="nav-language-button"');
    expect(navSource).toContain("min-w-0");
    expect(navSource).not.toContain("min-w-[10rem]");
    expect(navSource).toContain("px-5 text-base font-black");

    expect(navSource).toContain("px-2 py-3 text-base font-black");
    expect(navSource).not.toContain("px-3 py-3 text-sm font-bold");
    expect(navSource).not.toContain("px-3 py-3 text-lg font-black");

    expect(navSource).toContain('data-testid="nav-auth-links"');
    expect(navSource).toContain("bg-cyanGlow text-slate-950");
    expect(navSource).toContain("bg-white text-slate-950");
    expect(navSource).toContain("px-4 text-base font-black");
    expect(navSource).not.toContain("px-5 text-lg font-black");

    expect(navSource).toContain('data-testid="nav-theme-toggle"');
    expect(navSource).toContain("theme === \"dark\"");
    expect(navSource).toContain("bg-[#1f2937]");
    expect(navSource).toContain("bg-white text-amber-300");
  });
});
