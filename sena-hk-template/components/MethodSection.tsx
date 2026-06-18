"use client";

import { motion } from "framer-motion";
import { ArrowRight, CircleDotDashed, GitMerge, Network, Orbit, Sigma, UsersRound } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";

const conceptCards = [
  {
    title: "What is SENA?",
    icon: Orbit,
    text: "SENA models collaboration as a dynamic nexus: people, discourse moves, roles, communities, stages, scaffolding, and outcomes are analyzed together."
  },
  {
    title: "Why SNA alone is insufficient",
    icon: UsersRound,
    text: "SNA reveals participation, centrality, brokerage, reciprocity, and communities, but it cannot explain the epistemic content of interaction by itself."
  },
  {
    title: "Why ENA alone is insufficient",
    icon: Sigma,
    text: "ENA reveals connections among concepts, codes, or reasoning moves, but it does not inherently explain social position, brokerage, or communities."
  },
  {
    title: "How SENA integrates SNA + ENA + SENS",
    icon: GitMerge,
    text: "SENA extends SENS into an end-to-end research workflow where social structure and epistemic structure become jointly interpretable evidence."
  }
];

const layers = [
  { title: "Data layer", detail: "Trace data · transcripts · metadata · outcomes" },
  { title: "Coding layer", detail: "Manual · imported · AI-assisted · reliability" },
  { title: "Epistemic network layer", detail: "Codes as nodes · co-occurrence as edges" },
  { title: "Social network layer", detail: "Actors · ties · centrality · communities" },
  { title: "Social-epistemic integration layer", detail: "Roles · signatures · community profiles" },
  { title: "Comparison / prediction / reporting layer", detail: "Differences · trajectories · reports · exports" }
];

export function MethodSection() {
  const { copy } = useLanguage();

  return (
    <section id="method" className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
      <div className="absolute left-[-10rem] top-24 -z-10 h-[34rem] w-[34rem] rounded-full bg-violetGlow/10 blur-3xl" />
      <div className="absolute right-[-12rem] bottom-12 -z-10 h-[34rem] w-[34rem] rounded-full bg-magentaGlow/10 blur-3xl" />
      <SectionHeading kicker="Method" title={copy.sections.method} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.methodKicker}</p>

      <div className="mx-auto mt-12 grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {conceptCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, x: -18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
              >
                <Card className="rounded-[1.75rem] p-5">
                  <div className="flex gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violetGlow/12 text-violetGlow">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-foreground">{card.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted">{card.text}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <Card className="relative overflow-hidden rounded-[2.5rem] p-6 lg:p-8">
          <div className="absolute inset-0 bg-grid-lines bg-[length:34px_34px] opacity-30" />
          <div className="absolute right-6 top-6 font-mono text-xs leading-6 text-foreground/10">
            A = [wᵢⱼ] · E = Σ(codeᵢ, codeⱼ)<br />
            Role = f(centrality, discourse)<br />
            SENA(t) = SNA(t) ⊕ ENA(t)
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyanGlow/12 text-cyanGlow">
                <Network className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-cyanGlow">Nexus diagram</div>
                <h3 className="mt-1 text-2xl font-black text-foreground">From discourse traces to SENA evidence</h3>
              </div>
            </div>

            <div className="mt-8 grid gap-4">
              {layers.map((layer, index) => (
                <motion.div
                  key={layer.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                  className="group relative flex items-center gap-4 rounded-3xl border border-cardBorder/45 bg-card/45 p-4 backdrop-blur-xl"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-background/70 font-black text-cyanGlow shadow-inner">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-foreground">{layer.title}</div>
                    <div className="mt-1 text-sm text-muted">{layer.detail}</div>
                  </div>
                  {index < layers.length - 1 ? <ArrowRight className="hidden h-5 w-5 text-muted md:block" /> : <CircleDotDashed className="h-5 w-5 text-magentaGlow" />}
                  <div className="absolute inset-y-0 left-10 -z-10 w-px bg-gradient-to-b from-cyanGlow/0 via-cyanGlow/30 to-magentaGlow/0 group-last:hidden" />
                </motion.div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
