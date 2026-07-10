import Link from "next/link";

const sections = [
  {
    title: "Human Review",
    body: "AI-assisted coding or interpretation must remain reviewable by researchers. Unreviewed AI-coded evidence should stay flagged and should not support strong contribution or assessment claims."
  },
  {
    title: "Method Limits",
    body: "A_fusion is a typed adjacency object for observed relations. It is not a causal model, an automatic learner assessment, or proof that visual distances are statistically interpretable."
  },
  {
    title: "Evidence Traceability",
    body: "Every figure or export used for research interpretation should carry model parameters, normalization, runtime provenance, evidence snippets, coding reliability status, and claim-readiness status."
  },
  {
    title: "Fair Use of Outputs",
    body: "Use SENA outputs to support researcher reflection and transparent analysis, not to label students, rank participants across types, or replace contextual educational judgment."
  }
];

export default function ResponsibleAiPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-black text-cyanGlow">SENA.HK</Link>
        <h1 className="mt-6 text-4xl font-black">Responsible AI</h1>
        <p className="mt-4 text-lg leading-8 text-muted">Responsible use means keeping AI assistance, graph analytics, and human interpretation visibly separate.</p>
        <div className="mt-10 grid gap-6">
          {sections.map((section) => (
            <section key={section.title} className="border-t border-cardBorder/50 pt-6">
              <h2 className="text-xl font-black">{section.title}</h2>
              <p className="mt-3 leading-7 text-muted">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
