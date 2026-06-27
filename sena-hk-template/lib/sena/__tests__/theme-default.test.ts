import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("SENA theme default", () => {
  it("server-renders day mode before hydration", () => {
    const layoutSource = readProjectFile("app/layout.tsx");

    expect(layoutSource).toContain('<html lang="en" data-theme="light" suppressHydrationWarning>');
  });

  it("uses day mode when no saved theme preference exists", () => {
    const themeProviderSource = readProjectFile("components/ThemeProvider.tsx");

    expect(themeProviderSource).toContain('useState<Theme>("light")');
    expect(themeProviderSource).toContain('stored === "light" || stored === "dark" ? stored : "light"');
  });
});
