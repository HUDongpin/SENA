import Link from "next/link";

const sections = [
  {
    title: "Current Security Posture",
    body: "SENA includes session authentication, CSRF protection for cookie-auth mutations, security response headers, audit logs, and protected enterprise API routes. Production readiness still depends on managed identity, storage, backup, observability, and institution-owned operations evidence."
  },
  {
    title: "Sensitive Data",
    body: "Use pseudonymous identifiers for pilot uploads. Keep roster mappings, secrets, credentials, and institutional account details outside exports and source control."
  },
  {
    title: "Legacy Runtime Routes",
    body: "The standalone jENA API route is retained for compatibility but requires an authenticated session and CSRF token before it will run server-side analysis."
  },
  {
    title: "Reporting Issues",
    body: "Report security concerns to the project owner with the affected route, timestamp, and reproduction steps. Do not include passwords, API keys, or real student data in issue reports."
  }
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-black text-cyanGlow">SENA.HK</Link>
        <h1 className="mt-6 text-4xl font-black">Security</h1>
        <p className="mt-4 text-lg leading-8 text-muted">This page summarizes pilot security controls and the evidence still required before production claims.</p>
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
