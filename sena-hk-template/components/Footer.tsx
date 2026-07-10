"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { SenaLogo } from "./SenaLogo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/#platform" },
      { label: "Workspace", href: "/workspace/sena" },
      { label: "Demo", href: "/demo" },
      { label: "Enterprise", href: "/platform" }
    ]
  },
  {
    title: "Method",
    links: [
      { label: "SENA Framework", href: "/method" },
      { label: "SNA", href: "/method" },
      { label: "ENA", href: "/workspace/ena" },
      { label: "SENS", href: "/method" }
    ]
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "API", href: "/api/sena/docs" },
      { label: "Citation Guide", href: "/docs" },
      { label: "Research Cases", href: "/#cases" }
    ]
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "/security" },
      { label: "Responsible AI", href: "/responsible-ai" }
    ]
  }
];

export function Footer() {
  const { copy } = useLanguage();

  return (
    <footer className="relative overflow-hidden px-4 pb-10 pt-20 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-sena-radial opacity-70" />
      <div className="sena-grid absolute inset-0 -z-10 animate-gridMove opacity-25" />
      <div className="mx-auto max-w-7xl rounded-[2.5rem] border border-cardBorder/45 bg-card/45 p-6 backdrop-blur-2xl lg:p-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <SenaLogo />
            <p className="mt-5 max-w-md text-base leading-8 text-muted">{copy.footer.line}</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="font-black text-foreground">{column.title}</h3>
                <div className="mt-4 grid gap-3">
                  {column.links.map((link) => (
                    <Link key={link.label} href={link.href} className="text-sm font-semibold text-muted transition hover:text-cyanGlow">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 border-t border-cardBorder/40 pt-6 text-sm text-muted">
          © {new Date().getFullYear()} SENA.HK. Social-Epistemic Nexus Analytics.
        </div>
      </div>
    </footer>
  );
}
