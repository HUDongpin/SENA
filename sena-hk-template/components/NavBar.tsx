"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLanguage, type Lang } from "./LanguageProvider";
import { useTheme } from "./ThemeProvider";
import { SenaLogo } from "./SenaLogo";
import { cn } from "@/lib/utils";

const languageOptions: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zhHant", label: "繁體中文" },
  { value: "zhHans", label: "简体中文" }
];

function LanguageDropdown({
  lang,
  setLang,
  stretch = false,
  menuPlacement = "bottom"
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  stretch?: boolean;
  menuPlacement?: "bottom" | "top";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const activeLanguage = languageOptions.find((option) => option.value === lang) ?? languageOptions[0];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectLanguage = (nextLang: Lang) => {
    setLang(nextLang);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={cn("relative", stretch ? "w-full" : "w-fit")}>
      <button
        data-testid="nav-language-button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex h-12 min-w-0 items-center justify-center gap-3 rounded-full border border-cyanGlow/80 bg-white px-5 text-base font-black text-[#1259a5] shadow-[0_14px_34px_rgb(8_47_73/0.16),inset_0_1px_0_rgb(255_255_255/0.96)] transition hover:-translate-y-0.5 hover:border-cyanGlow hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyanGlow",
          stretch && "w-full justify-between px-5"
        )}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Language selector, current language ${activeLanguage.label}`}
      >
        <span>{activeLanguage.label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} strokeWidth={2.5} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: menuPlacement === "bottom" ? -6 : 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: menuPlacement === "bottom" ? -6 : 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute z-[60] overflow-hidden rounded-[1.85rem] border border-slate-200/85 bg-white/[0.96] p-3 text-slate-950 shadow-[0_24px_70px_rgb(8_47_73/0.18),inset_0_1px_0_rgb(255_255_255/0.92)] backdrop-blur-xl",
              stretch ? "left-0 right-0" : "right-0 w-64",
              menuPlacement === "bottom" ? "top-[calc(100%+0.75rem)]" : "bottom-[calc(100%+0.75rem)]"
            )}
          >
            <div id={listboxId} role="listbox" aria-label="Language options" className="grid gap-2">
              {languageOptions.map((option) => {
                const selected = lang === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectLanguage(option.value)}
                    className={cn(
                      "flex min-h-14 items-center justify-between rounded-[1.45rem] px-5 py-3 text-left text-base font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow",
                      selected ? "bg-cyanGlow/[0.82] text-slate-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    )}
                  >
                    <span>{option.label}</span>
                    {selected && <Check className="h-5 w-5 text-slate-950" strokeWidth={3} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AuthLinks({
  loginLabel,
  registerLabel,
  onNavigate,
  stretch = false
}: {
  loginLabel: string;
  registerLabel: string;
  onNavigate?: () => void;
  stretch?: boolean;
}) {
  return (
    <div
      data-testid="nav-auth-links"
      className={cn(
        "flex h-12 items-center gap-1 rounded-full border border-cardBorder/60 bg-white/80 p-1 shadow-[0_10px_28px_rgb(15_23_42/0.12),inset_0_1px_0_rgb(255_255_255/0.96)] backdrop-blur-xl",
        stretch && "w-full"
      )}
    >
      <Link
        href="/login"
        onClick={onNavigate}
        className={cn(
          "flex h-10 items-center justify-center rounded-full bg-cyanGlow text-slate-950 px-4 text-base font-black capitalize whitespace-nowrap shadow-[0_14px_28px_rgb(26_199_220/0.28)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow",
          stretch && "flex-1 px-4"
        )}
      >
        {loginLabel}
      </Link>
      <Link
        href="/register"
        onClick={onNavigate}
        className={cn(
          "flex h-10 items-center justify-center rounded-full bg-white text-slate-950 px-4 text-base font-black whitespace-nowrap shadow-[0_10px_24px_rgb(15_23_42/0.08)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow",
          stretch && "flex-1 px-4"
        )}
      >
        {registerLabel}
      </Link>
    </div>
  );
}

export function NavBar() {
  const { copy, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const navItems = [
    { label: copy.nav.home, href: "/" },
    { label: copy.nav.platform, href: "/platform" },
    { label: copy.nav.method, href: "/method" },
    { label: copy.nav.workspace, href: "/workspace" },
    { label: copy.nav.demo, href: "/demo" },
    { label: copy.nav.docs, href: "/docs" }
  ];

  return (
    <header className="sticky top-4 z-50 px-4 sm:px-6 lg:px-8">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[2.25rem] border border-cardBorder/55 bg-card/58 px-4 py-3 shadow-soft backdrop-blur-2xl"
        aria-label="Primary navigation"
      >
        <Link href="/" className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyanGlow">
          <SenaLogo />
        </Link>

        <div className="hidden items-center gap-1 rounded-full px-2 py-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-2 py-3 text-base font-black text-foreground/78 transition hover:bg-cyanGlow/12 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageDropdown lang={lang} setLang={setLang} />

          <button
            data-testid="nav-theme-toggle"
            onClick={toggleTheme}
            className={cn(
              "grid h-12 w-12 place-items-center rounded-full border transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyanGlow",
              theme === "dark"
                ? "border-white/20 bg-[#1f2937] text-amber-300 shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_14px_30px_rgb(0_0_0/0.25)] hover:bg-[#263241]"
                : "border-slate-200/85 bg-white text-amber-300 shadow-[0_10px_24px_rgb(15_23_42/0.12),inset_0_1px_0_rgb(255_255_255/0.95)] hover:border-slate-300"
            )}
            aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
          >
            {theme === "dark" ? <Sun className="h-6 w-6 fill-current" strokeWidth={2.2} /> : <Moon className="h-6 w-6 fill-current" strokeWidth={2.2} />}
          </button>

          <AuthLinks loginLabel={copy.nav.login} registerLabel={copy.nav.register} />
        </div>

        <button
          onClick={() => setOpen(true)}
          className="grid h-12 w-12 place-items-center rounded-full border border-cardBorder/60 bg-card/70 text-foreground lg:hidden"
          aria-label="Open navigation menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/45 p-4 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ x: 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 32, opacity: 0 }}
              className="glass-panel ml-auto flex h-full max-w-sm flex-col rounded-[2rem] p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <SenaLogo />
                <button
                  onClick={() => setOpen(false)}
                  className="grid h-11 w-11 place-items-center rounded-full border border-cardBorder/60 bg-card/60"
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-8 grid gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-2xl px-4 py-4 text-lg font-bold text-foreground/85 hover:bg-cyanGlow/10"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="mt-auto grid gap-4">
                <LanguageDropdown lang={lang} setLang={setLang} stretch menuPlacement="top" />
                <button
                  onClick={toggleTheme}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-full border px-4 py-3 font-bold transition",
                    theme === "dark" ? "border-white/20 bg-[#1f2937] text-amber-300" : "border-slate-200/85 bg-white text-amber-300"
                  )}
                >
                  {theme === "dark" ? <Sun className="h-5 w-5 fill-current" /> : <Moon className="h-5 w-5 fill-current" />}
                  {theme === "dark" ? "Day mode" : "Night mode"}
                </button>
                <AuthLinks loginLabel={copy.nav.login} registerLabel={copy.nav.register} onNavigate={() => setOpen(false)} stretch />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
