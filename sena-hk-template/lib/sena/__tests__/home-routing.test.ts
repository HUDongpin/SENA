import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("SENA home page routing", () => {
  it("keeps the home page focused on the screenshot hero", () => {
    const homeSource = readProjectFile("app/page.tsx");

    expect(homeSource).toContain("<NavBar />");
    expect(homeSource).toContain("<Hero />");
    expect(homeSource).not.toContain("<Workflow />");
    expect(homeSource).not.toContain("<MethodSection />");
    expect(homeSource).not.toContain("<WorkspacePreview />");
    expect(homeSource).not.toContain("<ResearchCases />");
    expect(homeSource).not.toContain("<AnalyticsGallery />");
    expect(homeSource).not.toContain("<EthicsSection />");
    expect(homeSource).not.toContain("<DocsSection />");
    expect(homeSource).not.toContain("<Footer />");
  });

  it("routes primary navigation items to dedicated pages instead of home anchors", () => {
    const navSource = readProjectFile("components/NavBar.tsx");

    for (const href of ["/", "/platform", "/method", "/workspace", "/demo", "/docs"]) {
      expect(navSource).toContain(`href: "${href}"`);
    }

    expect(navSource).not.toContain('href: "/#home"');
    expect(navSource).not.toContain('href: "/#platform"');
    expect(navSource).not.toContain('href: "/#method"');
    expect(navSource).not.toContain('href: "/#workspace"');
    expect(navSource).not.toContain('href: "/#docs"');
  });

  it("has dedicated pages for navigation destinations", () => {
    for (const route of ["platform", "method", "workspace", "demo", "docs"]) {
      expect(existsSync(path.join(process.cwd(), "app", route, "page.tsx"))).toBe(true);
    }
  });

  it("removes the decorative lower-right logo from the hero screenshot area", () => {
    const heroSource = readProjectFile("components/Hero.tsx");

    expect(heroSource).not.toContain("Layers3");
    expect(heroSource).toContain('href="/method"');
    expect(heroSource).not.toContain('href="#method"');
  });
});
