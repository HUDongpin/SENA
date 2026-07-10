import Link from "next/link";

const sections = [
  {
    title: "Research Pilot Scope",
    body: "SENA is a research-pilot analytics tool for social-epistemic discourse analysis. Real student or institutional data should be uploaded only under an approved study protocol, consent scope, and retention plan."
  },
  {
    title: "Data Uploaded to SENA",
    body: "Pilot analyses may include pseudonymous people, interactions, utterances, coded segments, codebooks, reliability annotations, validation metadata, and export artifacts. Do not upload direct identifiers unless your institution has approved that handling path."
  },
  {
    title: "Storage and Deletion",
    body: "Local pilot deployments may use the local enterprise store. Beta or production use requires institution-approved managed storage, access controls, deletion procedures, and backup evidence before claims of production readiness."
  },
  {
    title: "Research Exports",
    body: "Reports, snapshots, review packets, and publication exports can contain evidence snippets and model parameters. Review exports for sensitive content before sharing them outside the study team."
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-black text-cyanGlow">SENA.HK</Link>
        <h1 className="mt-6 text-4xl font-black">Privacy</h1>
        <p className="mt-4 text-lg leading-8 text-muted">This page states the privacy baseline for SENA research pilots. It does not replace institutional ethics, data-protection, or legal review.</p>
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
