"use client";

import { motion } from "framer-motion";
import { BookOpenCheck, BrainCircuit, GraduationCap, Lightbulb, MessagesSquare } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";

const cases = [
  {
    title: "MOOC collaborative learning",
    icon: MessagesSquare,
    points: ["Social ties", "Discourse topics", "Communities", "Centrality", "Performance prediction"],
    description: "Analyze large-scale forum interaction as linked social and epistemic patterns."
  },
  {
    title: "Interdisciplinary lesson study",
    icon: GraduationCap,
    points: ["Teacher collaboration", "AI-integrated science course", "Studying", "Planning", "Teaching", "Reflecting"],
    description: "Trace how teachers and faculty negotiate roles, problems of practice, and solution generation."
  },
  {
    title: "Knowledge building and teacher scaffolding",
    icon: BookOpenCheck,
    points: ["Reflective assessment", "KBDeX", "Teacher + technology scaffolding", "Social-epistemic engagement"],
    description: "Compare how scaffolding configurations shape interaction, discourse, and group artifacts."
  },
  {
    title: "Deep learning representation",
    icon: BrainCircuit,
    points: ["Cognitive", "Interpersonal", "Intrapersonal / self", "Dynamic evidence", "Discourse traces"],
    description: "Represent deep learning as connected cognitive, social, and self-regulatory processes."
  }
];

export function ResearchCases() {
  const { copy } = useLanguage();

  return (
    <section id="demo" className="relative px-4 py-20 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-20 -z-10 h-96 bg-gradient-to-r from-cyanGlow/10 via-violetGlow/10 to-magentaGlow/10 blur-3xl" />
      <SectionHeading kicker="Demo" title={copy.sections.cases} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.casesKicker}</p>

      <div className="mx-auto mt-12 grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cases.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.07 }}
            >
              <Card className="relative h-full overflow-hidden rounded-[2rem] p-6">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyanGlow/15 blur-2xl" />
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cardBorder/50 bg-card/60 text-cyanGlow">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-xl font-black text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{item.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {item.points.map((point) => (
                    <span key={point} className="rounded-full border border-cardBorder/45 bg-background/45 px-3 py-1 text-xs font-bold text-foreground/70">
                      {point}
                    </span>
                  ))}
                </div>
                <Lightbulb className="absolute bottom-5 right-5 h-16 w-16 text-violetGlow/10" />
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
