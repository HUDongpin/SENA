"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { useLanguage, type Lang } from "./LanguageProvider";
import { useTheme } from "./ThemeProvider";
import { SenaLogo } from "./SenaLogo";
import { buttonStyles } from "./Primitives";
import { cn } from "@/lib/utils";

const languageOptions: { value: Lang; label: string }[] = [
  { value: "en", label: "ENG" },
  { value: "zhHant", label: "繁" },
  { value: "zhHans", label: "简" }
];

export function NavBar() {
  const { copy, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const navItems = [
    { label: copy.nav.home, href: "/#home" },
    { label: copy.nav.platform, href: "/#platform" },
    { label: copy.nav.method, href: "/#method" },
    { label: copy.nav.workspace, href: "/#workspace" },
    { label: copy.nav.demo, href: "/workspace/sena" },
    { label: copy.nav.docs, href: "/#docs" }
  ];

  return (
    <header className="sticky top-4 z-50 px-4 sm:px-6 lg:px-8">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[2.25rem] border border-cardBorder/55 bg-card/58 px-4 py-3 shadow-soft backdrop-blur-2xl"
        aria-label="Primary navigation"
      >
        <Link href="/#home" className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyanGlow">
          <SenaLogo />
        </Link>

        <div className="hidden items-center gap-1 rounded-full px-2 py-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-3 text-sm font-bold text-foreground/78 transition hover:bg-cyanGlow/12 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <div className="flex rounded-full border border-cardBorder/60 bg-background/50 p-1 shadow-inner" role="group" aria-label="Language selector">
            {languageOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setLang(option.value)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow",
                  lang === option.value ? "bg-cyanGlow text-slate-950 shadow-glow" : "text-muted hover:bg-card/80 hover:text-foreground"
                )}
                aria-pressed={lang === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            onClick={toggleTheme}
            className="grid h-12 w-12 place-items-center rounded-full border border-cardBorder/60 bg-card/65 text-foreground shadow-soft transition hover:-translate-y-0.5 hover:border-cyanGlow/40 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <Link href="/login" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            {copy.nav.login}
          </Link>
          <Link href="/register" className={buttonStyles({ variant: "dark", size: "sm" })}>
            {copy.nav.register}
          </Link>
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
                <div className="flex rounded-full border border-cardBorder/60 bg-background/50 p-1">
                  {languageOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setLang(option.value)}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-sm font-black transition",
                        lang === option.value ? "bg-cyanGlow text-slate-950" : "text-muted"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center gap-2 rounded-full border border-cardBorder/60 bg-card/60 px-4 py-3 font-bold"
                >
                  {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  {theme === "dark" ? "Day mode" : "Night mode"}
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/login" onClick={() => setOpen(false)} className={buttonStyles({ className: "w-full", variant: "secondary" })}>
                    {copy.nav.login}
                  </Link>
                  <Link href="/register" onClick={() => setOpen(false)} className={buttonStyles({ className: "w-full", variant: "dark" })}>
                    {copy.nav.register}
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
