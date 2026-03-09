import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookOpen, Layers, GitMerge, Shield, Zap, Users } from "lucide-react";

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900">
      {/* ── Nav ─────────────────────────────────────── */}
      <nav className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Sightstone</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-28 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300">
          <Zap className="h-3.5 w-3.5" />
          Powered by Claude AI
        </div>
        <h1 className="mx-auto mb-6 max-w-4xl text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
          Harmonise your contract{" "}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            playbooks
          </span>{" "}
          with AI
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-400">
          Upload multiple contracts, automatically extract and compare clauses by
          contractual effect, identify overlaps, and produce a single harmonised
          playbook — all in minutes.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white px-8">
              Start harmonising free
            </Button>
          </Link>
          <Link href="#features">
            <Button size="lg" variant="outline" className="border-white/20 text-slate-300 hover:bg-white/10 hover:text-white">
              See how it works
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Steps ───────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-white">
          From contracts to harmonised playbook in 4 steps
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <step.icon className="h-6 w-6" />
              </div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-400">
                Step {i + 1}
              </div>
              <h3 className="mb-2 font-semibold text-white">{step.title}</h3>
              <p className="text-sm text-slate-400">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-white">
          Everything your legal team needs
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="mb-4 text-3xl font-bold text-white">
          Ready to unify your contract playbooks?
        </h2>
        <p className="mb-8 text-slate-400">
          Free to get started. No credit card required.
        </p>
        <Link href="/register">
          <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white px-10">
            Create your organisation
          </Button>
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Sightstone. Built with Next.js, Tailwind CSS & Claude AI.
      </footer>
    </div>
  );
}

const STEPS = [
  {
    icon: Users,
    title: "Create your organisation",
    description: "Sign up, create your organisation, and invite your legal team members.",
  },
  {
    icon: BookOpen,
    title: "Create a playbook",
    description: "Name your harmonisation project and upload two or more contracts (PDF, DOCX, TXT).",
  },
  {
    icon: Layers,
    title: "AI extracts & compares clauses",
    description: "Claude AI extracts every clause, categorises by contractual effect, and identifies overlaps.",
  },
  {
    icon: GitMerge,
    title: "Select or accept suggested wording",
    description: "Choose preferred wording per clause type or accept AI-normalised language to produce your playbook.",
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Clause extraction",
    description: "Automatically extract clauses from PDF, DOCX, and TXT contracts.",
  },
  {
    icon: GitMerge,
    title: "Clause harmonisation",
    description: "Compare identical clause types across contracts and produce unified language.",
  },
  {
    icon: Shield,
    title: "Risk labelling",
    description: "Each clause is tagged with a risk level (Low → Critical) for prioritisation.",
  },
  {
    icon: Zap,
    title: "AI-suggested wording",
    description: "Claude AI drafts a balanced, normalised clause where contracts differ.",
  },
  {
    icon: Users,
    title: "Organisation collaboration",
    description: "Invite team members, assign roles, and collaborate on playbooks together.",
  },
  {
    icon: BookOpen,
    title: "Playbook export",
    description: "Export your finalised harmonised playbook as a structured document.",
  },
];
