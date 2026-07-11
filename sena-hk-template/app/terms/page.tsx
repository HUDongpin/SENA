import Link from "next/link";

const sections = [
  {
    title: "Use Boundary",
    body: "Use SENA outputs as exploratory research evidence unless the data contract, runtime alignment, fusion math, validation, coding reliability, data governance, and human-review gates are complete."
  },
  {
    title: "No Automated Decisions",
    body: "SENA figures and metrics must not be used as automatic assessment, grading, employment, disciplinary, or high-stakes instructional decisions."
  },
  {
    title: "Research Responsibility",
    body: "Researchers are responsible for consent, coding reliability, interpretation limits, export review, and study-specific validation before publication or external sharing."
  },
  {
    title: "Pilot Availability",
    body: "The local pilot may change as the July 2026 mathematical migration proceeds. Back up project snapshots and review packets before relying on them for study records."
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-black text-cyanGlow">SENA.HK</Link>
        <h1 className="mt-6 text-4xl font-black">Terms</h1>
        <p className="mt-4 text-lg leading-8 text-muted">These pilot terms keep SENA research use aligned with its current evidence gates and method limits.</p>
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
