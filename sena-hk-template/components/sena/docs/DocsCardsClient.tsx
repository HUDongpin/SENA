"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BookMarked,
  Braces,
  FileQuestion,
  FileText,
  GraduationCap,
  Library,
  Network,
  ScrollText
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { Card, SectionHeading } from "@/components/Primitives";

export function DocsCardsClient({ endpointCount, methodCount }: {
  endpointCount: number;
  methodCount: number;
}) {
  const { copy } = useLanguage();
  const docs = [
    { title: "SENA Framework", icon: Library, summary: "Theory, constructs, assumptions, and analytic layers." },
    { title: "SNA Guide", icon: Network, summary: "Tie extraction, centrality, reciprocity, communities, and roles." },
    { title: "ENA Guide", icon: BookMarked, summary: "Units, stanzas, code co-occurrence, centroids, and difference networks." },
    { title: "SENS Background", icon: GraduationCap, summary: "How SNA and ENA combine to study collaborative learning." },
    { title: "Coding Schemes", icon: FileQuestion, summary: "Templates for PPT, knowledge building, design thinking, and custom discourse codes." },
    { title: "Reproducibility Guide", icon: ScrollText, summary: "Export settings, project logs, captions, and transparent methods notes." },
    { title: "API Documentation", icon: Braces, summary: `${endpointCount} documented SENA route resources covering ${methodCount} HTTP methods, exported as JSON and OpenAPI 3.1.` },
    { title: "Citation Guide", icon: FileText, summary: "Suggested wording for methods, AI-use statements, and data availability." }
  ];

  return (
    <>
      <SectionHeading kicker="Docs" title={copy.sections.docs} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.docsKicker}</p>
      <div className="mx-auto mt-12 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {docs.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: index * 0.04 }}>
              <Card className="group h-full rounded-[1.5rem] p-5">
                <div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyanGlow/12 text-cyanGlow"><Icon className="h-5 w-5" /></div><ArrowUpRight className="h-5 w-5 text-muted transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-cyanGlow" /></div>
                <h3 className="mt-5 font-black text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
