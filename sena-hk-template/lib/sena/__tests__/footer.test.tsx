import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Footer } from "../../../components/Footer";
import { LanguageProvider } from "../../../components/LanguageProvider";

describe("Footer", () => {
  it("does not render a duplicate language selector", () => {
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    );

    expect(markup).not.toContain('aria-label="Footer language selector"');
    expect(markup).not.toContain(">ENG<");
    expect(markup).not.toContain(">繁<");
    expect(markup).not.toContain(">简<");
  });

  it("does not render the built-for footer callout", () => {
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    );

    expect(markup).not.toContain("Built for social-epistemic research, discourse analysis, and reproducible learning analytics.");
  });

  it("links legal resources to real pages instead of the docs placeholder", () => {
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    );

    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('href="/terms"');
    expect(markup).toContain('href="/security"');
    expect(markup).toContain('href="/responsible-ai"');
  });
});
