"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, BookMarked, Braces, FileQuestion, FileText, GraduationCap, Library, Network, ScrollText } from "lucide-react";
import { SENA_API_DOCS_SECTION_MANIFEST } from "@/lib/sena/api-docs-section";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";

const apiEndpointCount = SENA_API_DOCS_SECTION_MANIFEST.endpointCount;
const apiMethodCount = SENA_API_DOCS_SECTION_MANIFEST.methodCount;
const apiOpsHandoffSchemas = SENA_API_DOCS_SECTION_MANIFEST.opsHandoffSchemas;
const apiGroups = SENA_API_DOCS_SECTION_MANIFEST.groupCards;
const apiEndpointRows = SENA_API_DOCS_SECTION_MANIFEST.endpointRows;

const docs = [
  { title: "SENA Framework", icon: Library, summary: "Theory, constructs, assumptions, and analytic layers." },
  { title: "SNA Guide", icon: Network, summary: "Tie extraction, centrality, reciprocity, communities, and roles." },
  { title: "ENA Guide", icon: BookMarked, summary: "Units, stanzas, code co-occurrence, centroids, and difference networks." },
  { title: "SENS Background", icon: GraduationCap, summary: "How SNA and ENA combine to study collaborative learning." },
  { title: "Coding Schemes", icon: FileQuestion, summary: "Templates for PPT, knowledge building, design thinking, and custom discourse codes." },
  { title: "Reproducibility Guide", icon: ScrollText, summary: "Export settings, project logs, captions, and transparent methods notes." },
  { title: "API Documentation", icon: Braces, summary: `${apiEndpointCount} documented SENA route resources covering ${apiMethodCount} HTTP methods, exported as JSON and OpenAPI 3.1.` },
  { title: "Citation Guide", icon: FileText, summary: "Suggested wording for methods, AI-use statements, and data availability." }
];

export function DocsSection() {
  const { copy } = useLanguage();

  return (
    <section id="docs" className="relative px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading kicker="Docs" title={copy.sections.docs} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.docsKicker}</p>

      <div className="mx-auto mt-12 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {docs.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: index * 0.04 }}
            >
              <Card className="group h-full rounded-[1.5rem] p-5">
                <div className="flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyanGlow/12 text-cyanGlow">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-muted transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-cyanGlow" />
                </div>
                <h3 className="mt-5 font-black text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div data-testid={SENA_API_DOCS_SECTION_MANIFEST.testIds.panel} className="mx-auto mt-6 max-w-7xl rounded-[1.25rem] border border-cardBorder/55 bg-background/70 p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyanGlow/12 text-cyanGlow">
              <Braces className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-foreground">Enterprise API contract</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                {apiEndpointCount} route resources, {apiMethodCount} method contracts, and coverage tests for the current Next API surface.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/sena/docs" className="rounded-lg border border-cardBorder/60 px-3 py-2 text-xs font-black text-foreground transition hover:border-cyanGlow hover:text-cyanGlow">
              JSON contract
            </a>
            <a href="/api/sena/docs?format=openapi" className="rounded-lg bg-cyanGlow px-3 py-2 text-xs font-black text-background transition hover:bg-cyanGlow/85">
              OpenAPI 3.1
            </a>
          </div>
        </div>
        <div data-testid={SENA_API_DOCS_SECTION_MANIFEST.testIds.opsHandoff} className="mt-4 grid gap-2 rounded-xl border border-cardBorder/45 bg-background/45 p-3 text-xs font-semibold leading-5 text-muted sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="font-black uppercase tracking-[0.14em] text-cyanGlow">Ops handoff contract</div>
            <div className="mt-1 break-words">
              {apiOpsHandoffSchemas.join(" · ")}
            </div>
          </div>
          <a href="/api/sena/docs?format=openapi" className="self-start rounded-lg border border-cardBorder/60 px-3 py-2 text-xs font-black text-foreground transition hover:border-cyanGlow hover:text-cyanGlow">
            OpenAPI ops paths
          </a>
        </div>
        <div className="mt-5 grid gap-4 border-t border-cardBorder/45 pt-4 md:grid-cols-2 lg:grid-cols-3">
          {apiGroups.map((group) => (
            <div key={group.id} data-testid={SENA_API_DOCS_SECTION_MANIFEST.testIds.group} data-api-group={group.id} className="border-l border-cardBorder/60 pl-3">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-cyanGlow">{group.title}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{group.endpointCount} resources · {group.methodCount} methods</div>
              <div className="mt-2 space-y-1">
                {group.samples.map((sample) => (
                  <div key={sample} className="truncate font-mono text-[11px] text-muted">{sample}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div data-testid={SENA_API_DOCS_SECTION_MANIFEST.testIds.endpointMatrix} className="mt-5 max-h-96 overflow-auto rounded-xl border border-cardBorder/45 bg-background/45">
          <div className="grid min-w-[58rem] grid-cols-[7rem_minmax(14rem,1.4fr)_8rem_9rem_minmax(16rem,1fr)] border-b border-cardBorder/45 px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.14em] text-muted">
            <div>Methods</div>
            <div>Path</div>
            <div>Auth</div>
            <div>Group</div>
            <div>Responses</div>
          </div>
          {apiEndpointRows.map((endpoint) => (
            <div
              key={endpoint.id}
              data-testid={SENA_API_DOCS_SECTION_MANIFEST.testIds.endpointRow}
              data-api-endpoint={endpoint.id}
              className="grid min-w-[58rem] grid-cols-[7rem_minmax(14rem,1.4fr)_8rem_9rem_minmax(16rem,1fr)] items-center gap-2 border-b border-cardBorder/30 px-3 py-2 text-xs font-semibold text-muted last:border-b-0"
            >
              <div className="font-black text-cyanGlow">{endpoint.methods}</div>
              <div className="truncate font-mono text-[11px] text-foreground">{endpoint.path}</div>
              <div className="truncate text-[11px] uppercase">{endpoint.auth}</div>
              <div className="truncate text-[11px] uppercase">{endpoint.group}</div>
              <div className="truncate font-mono text-[11px]">
                {endpoint.responsesPreview}
                {endpoint.hiddenResponseCount > 0 ? ` · +${endpoint.hiddenResponseCount}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
