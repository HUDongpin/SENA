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
    expect(navSource).toContain("xl:px-5 xl:text-base");

    expect(navSource).toContain("xl:px-2 xl:py-3 xl:text-base xl:font-black");
    expect(navSource).not.toContain("px-3 py-3 text-sm font-bold");
    expect(navSource).not.toContain("px-3 py-3 text-lg font-black");

    expect(navSource).toContain('data-testid="nav-auth-links"');
    expect(navSource).toContain("bg-cyanGlow text-slate-950");
    expect(navSource).toContain("bg-white text-slate-950");
    expect(navSource).toContain("xl:px-4 xl:text-base xl:font-black");
    expect(navSource).not.toContain("px-5 text-lg font-black");

    expect(navSource).toContain('data-testid="nav-theme-toggle"');
    expect(navSource).toContain("theme === \"dark\"");
    expect(navSource).toContain("bg-[#1f2937]");
    expect(navSource).toContain("bg-white text-amber-300");
  });

  // The desktop row has to survive every width it is shown at. Below xl the
  // controls run at their compact size and the brand text is withheld, because
  // the full-size row needs about 1290px and used to overflow the page from
  // 1024px up.
  it("steps the desktop bar down below xl so the row never overflows", () => {
    const navSource = readProjectFile("components/NavBar.tsx");

    expect(navSource).toContain("h-10 px-3.5 text-sm font-black xl:h-12");
    expect(navSource).toContain("h-8 px-3 text-sm font-black xl:h-10");
    expect(navSource).toContain("px-2 py-2.5 text-sm font-black");
    expect(navSource).toContain("grid h-10 w-10 place-items-center rounded-full border");
    expect(navSource).toContain('wordmarkClassName="hidden xl:block"');
    expect(navSource).toContain('taglineClassName="hidden 2xl:block"');
  });
});
