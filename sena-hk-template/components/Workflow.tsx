"use client";

import { motion } from "framer-motion";
import {
  Archive,
  BarChart3,
  Binary,
  Bot,
  Boxes,
  Braces,
  Code2,
  FileText,
  GitCompare,
  Network,
  UploadCloud
} from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";

const modules = [
  {
    title: "Data Import",
    icon: UploadCloud,
    description: "Bring discourse, interaction, timestamp, role, and outcome data into a structured project.",
    inputs: "CSV, Excel, JSON, LMS/forum exports, transcripts",
    outputs: "Cleaned dataset, actor map, missing-value report"
  },
  {
    title: "Coding Studio",
    icon: Code2,
    description: "Create or import codebooks, manually code discourse, and review AI-assisted suggestions.",
    inputs: "Discourse units, coding schemes, raters",
    outputs: "Coded dataset, code frequencies, reliability notes"
  },
  {
    title: "ENA Builder",
    icon: Binary,
    description: "Model epistemic networks where concepts, skills, discourse moves, or codes become connected nodes.",
    inputs: "Coded discourse, units, stanzas/windows",
    outputs: "ENA graphs, centroids, difference networks"
  },
  {
    title: "SNA Builder",
    icon: Network,
    description: "Construct actor networks from replies, mentions, co-participation, editing, or turn-taking.",
    inputs: "Actor IDs, tie rules, directed/weighted events",
    outputs: "Centrality, density, reciprocity, communities"
  },
  {
    title: "SENA Fusion Lab",
    icon: Boxes,
    description: "Assemble a typed social-epistemic graph from S, W, and B layers with declared weights and normalization.",
    inputs: "R interactions, X coded discourse, Y participation",
    outputs: "A_fusion evidence, typed roles, model-carded figures"
  },
  {
    title: "Group Comparison",
    icon: GitCompare,
    description: "Compare groups, conditions, stages, or high/low outcome communities with cautious statistical framing.",
    inputs: "Group labels, conditions, model parameters",
    outputs: "Difference maps, effect sizes, confidence intervals"
  },
  {
    title: "Temporal Analysis",
    icon: BarChart3,
    description: "Trace changes across phases such as studying, planning, teaching, reflecting, inquiry, or design cycles.",
    inputs: "Timestamps, phases, episodes, sliding windows",
    outputs: "Stage trajectories, temporal networks, transition notes"
  },
  {
    title: "AI-Assisted Interpretation",
    icon: Bot,
    description: "Draft cautious interpretation paragraphs grounded in selected figures, parameters, and verified evidence.",
    inputs: "Network outputs, user-selected claims, codebook",
    outputs: "Draft explanations, caveat flags, human-review queue"
  },
  {
    title: "Report Generator",
    icon: FileText,
    description: "Generate publication-ready method notes, figures, captions, and reproducible project summaries.",
    inputs: "Project state, figures, statistics, methods metadata",
    outputs: "Word/PDF/HTML reports and citation-ready notes"
  },
  {
    title: "Export / API / Reproducibility",
    icon: Archive,
    description: "Export complete research artifacts so teams can audit, reproduce, extend, and publish analyses.",
    inputs: "Data, codebook, parameters, logs",
    outputs: "CSV, SVG/PNG, JSON project file, R/Python scripts"
  }
];

export function Workflow() {
  const { copy } = useLanguage();

  return (
    <section id="platform" className="relative px-4 py-20 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-cyanGlow/5 to-transparent" />
      <SectionHeading kicker="Platform" title={copy.sections.platform} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.platformKicker}</p>

      <div className="mx-auto mt-12 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-5">
        {modules.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, delay: index * 0.035 }}
              className="h-full"
            >
              <Card className="relative h-full rounded-[1.75rem] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyanGlow/30 bg-cyanGlow/10 text-cyanGlow">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-card/55 px-2.5 py-1 text-xs font-black text-muted">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 text-lg font-black text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{item.description}</p>
                <div className="mt-5 space-y-3 text-xs leading-5">
                  <div>
                    <div className="font-black uppercase tracking-[0.18em] text-cyanGlow">{copy.labels.inputs}</div>
                    <div className="mt-1 text-foreground/74">{item.inputs}</div>
                  </div>
                  <div>
                    <div className="font-black uppercase tracking-[0.18em] text-magentaGlow">{copy.labels.outputs}</div>
                    <div className="mt-1 text-foreground/74">{item.outputs}</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
