"use client";

import { motion } from "framer-motion";
import { ClipboardCheck, Eye, FileArchive, Fingerprint, LockKeyhole, Scale, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";

const ethics = [
  { title: "Anonymization tools", icon: Fingerprint, text: "Mask names, IDs, institutions, and sensitive metadata before analysis or export." },
  { title: "Role-based access control", icon: LockKeyhole, text: "Separate project owners, coders, viewers, lab admins, and external collaborators." },
  { title: "Consent / IRB metadata", icon: ClipboardCheck, text: "Record approval IDs, consent scope, data retention, and usage constraints." },
  { title: "Audit logs", icon: Eye, text: "Track changes to data, codes, parameters, reports, and AI-generated drafts." },
  { title: "AI coding transparency", icon: ShieldAlert, text: "Store confidence scores, prompts, versions, human review state, and uncertainty flags." },
  { title: "Bias warnings", icon: Scale, text: "Avoid interpreting centrality, performance, or discourse quality as automatic judgment." },
  { title: "Reproducibility exports", icon: FileArchive, text: "Export codebook, filtered data, window settings, model parameters, figures, and logs." },
  { title: "Human review required", icon: UserCheck, text: "AI can draft interpretations, but researchers must validate claims against context and evidence." }
];

export function EthicsSection() {
  const { copy } = useLanguage();

  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-1/2 -z-10 h-[30rem] -translate-y-1/2 bg-gradient-to-r from-cyanGlow/10 via-transparent to-magentaGlow/10 blur-3xl" />
      <SectionHeading kicker="Responsible AI" title={copy.sections.ethics} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.ethicsKicker}</p>

      <div className="mx-auto mt-12 grid max-w-7xl gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="relative overflow-hidden rounded-[2rem] p-8">
          <ShieldCheck className="h-12 w-12 text-cyanGlow" />
          <h3 className="mt-6 text-3xl font-black tracking-tight text-foreground">Trustworthy by design</h3>
          <p className="mt-4 text-base leading-8 text-muted">
            SENA should support rigorous interpretation rather than automate research judgment. Every figure, code, prompt, parameter, and conclusion should be traceable.
          </p>
          <div className="mt-6 rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm font-semibold leading-7 text-foreground/78">
            {copy.labels.aiNotice}
          </div>
          <div className="absolute -bottom-20 -right-20 h-48 w-48 rounded-full bg-cyanGlow/20 blur-3xl" />
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {ethics.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.04 }}
              >
                <Card className="h-full rounded-[1.5rem] p-5">
                  <div className="flex gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violetGlow/12 text-violetGlow">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-foreground">{item.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
