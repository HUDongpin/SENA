"use client";

import Link from "next/link";
import { useLanguage, type Lang } from "./LanguageProvider";
import { SenaLogo } from "./SenaLogo";
import { cn } from "@/lib/utils";

const languageOptions: { value: Lang; label: string }[] = [
  { value: "en", label: "ENG" },
  { value: "zhHant", label: "繁" },
  { value: "zhHans", label: "简" }
];

const columns = [
  { title: "Product", links: ["Platform", "Workspace", "Demo", "Enterprise"] },
  { title: "Method", links: ["SENA Framework", "SNA", "ENA", "SENS"] },
  { title: "Resources", links: ["Docs", "API", "Citation Guide", "Research Cases"] },
  { title: "Legal", links: ["Privacy", "Terms", "Security", "Responsible AI"] }
];

export function Footer() {
  const { copy, lang, setLang } = useLanguage();

  return (
    <footer className="relative overflow-hidden px-4 pb-10 pt-20 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-sena-radial opacity-70" />
      <div className="sena-grid absolute inset-0 -z-10 animate-gridMove opacity-25" />
      <div className="mx-auto max-w-7xl rounded-[2.5rem] border border-cardBorder/45 bg-card/45 p-6 backdrop-blur-2xl lg:p-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <SenaLogo />
            <p className="mt-5 max-w-md text-base leading-8 text-muted">{copy.footer.line}</p>
            <p className="mt-5 rounded-3xl border border-cyanGlow/25 bg-cyanGlow/10 p-4 text-sm font-semibold leading-6 text-foreground/78">
              {copy.footer.built}
            </p>
            <div className="mt-5 flex w-fit rounded-full border border-cardBorder/60 bg-background/50 p-1" aria-label="Footer language selector">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setLang(option.value)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-black transition",
                    lang === option.value ? "bg-cyanGlow text-slate-950" : "text-muted hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="font-black text-foreground">{column.title}</h3>
                <div className="mt-4 grid gap-3">
                  {column.links.map((link) => (
                    <Link key={link} href="/#docs" className="text-sm font-semibold text-muted transition hover:text-cyanGlow">
                      {link}
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
