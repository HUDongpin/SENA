"use client";

import { motion } from "framer-motion";
import { ArrowRight, Bot, GitBranch, Layers3, Network, ShieldCheck } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, buttonStyles } from "./Primitives";
import { NetworkVisualization } from "./NetworkVisualization";

const metrics = [
  { label: "SNA + ENA", icon: Network, value: "Dual network evidence" },
  { label: "Temporal SENA", icon: GitBranch, value: "Stage-by-stage traces" },
  { label: "Reproducible Reports", icon: ShieldCheck, value: "Parameters + figures" },
  { label: "AI-assisted interpretation", icon: Bot, value: "Human-reviewed drafts" }
];

export function Hero() {
  const { copy } = useLanguage();

  return (
    <section id="home" className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 lg:px-8 lg:pb-28 lg:pt-20">
      <div className="absolute inset-0 -z-10 bg-sena-radial" />
      <div className="sena-grid absolute inset-0 -z-10 animate-gridMove opacity-25" />
      <div className="absolute left-1/2 top-24 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyanGlow/10 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
        <div>
          <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
            <h1 className="hero-display-title max-w-5xl text-5xl text-foreground sm:text-6xl lg:text-7xl">
              <span className="gradient-text">{copy.hero.title}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl font-semibold leading-8 text-foreground/82 sm:text-2xl">
              {copy.hero.subtitle}
            </p>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted sm:text-lg">{copy.hero.support}</p>
          </motion.div>

          <motion.div
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap"
          >
            <a href="/workspace/sena" className={buttonStyles({ size: "lg" })}>
              {copy.hero.launch}
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </a>
            <a href="#method" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              {copy.hero.method}
            </a>
          </motion.div>

          <motion.div
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 grid gap-3 sm:grid-cols-3"
          >
            {copy.hero.taglines.map((line) => (
              <div key={line} className="rounded-2xl border border-cardBorder/45 bg-card/40 p-4 text-sm font-semibold text-foreground/78 backdrop-blur-xl">
                {line}
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative"
        >
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-cyanGlow/20 via-violetGlow/20 to-magentaGlow/20 blur-2xl" />
          <NetworkVisualization className="animate-float" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.label} className="rounded-2xl p-4 hover:translate-y-0">
                  <Icon className="h-5 w-5 text-cyanGlow" />
                  <div className="mt-3 text-sm font-black text-foreground">{metric.label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">{metric.value}</div>
                </Card>
              );
            })}
          </div>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute bottom-[-18rem] left-1/2 h-[36rem] w-[90rem] -translate-x-1/2 rounded-[50%] border border-cyanGlow/20 bg-cyanGlow/5 blur-sm" />
      <Layers3 className="pointer-events-none absolute bottom-20 right-12 h-20 w-20 text-violetGlow/10" />
    </section>
  );
}
