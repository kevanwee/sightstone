import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Plus, FileText, GitMerge, ChevronRight, Sparkles,
} from "lucide-react";
import { formatRelativeTime, STATUS_COLOURS } from "@/lib/utils";

async function getDashboardData(userId: string) {
  const membership = await db.organisationMember.findFirst({
    where: { userId },
    include: {
      organisation: {
        include: {
          playbooks: {
            include: { _count: { select: { contracts: true, clauseGroups: true } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          _count: { select: { members: true } },
        },
      },
    },
  });
  return membership;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await getDashboardData(session.user.id);
  if (!membership) redirect("/register");

  const org = membership.organisation;
  const playbooks = org.playbooks;

  const stats = {
    total: playbooks.length,
    harmonised: playbooks.filter((p) => p.status === "HARMONISED").length,
    inProgress: playbooks.filter((p) => ["ANALYSING", "REVIEW"].includes(p.status)).length,
    members: org._count.members,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-slate-500">{org.name}</p>
        </div>
        <Link href="/dashboard/playbooks/new">
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4" />
            New playbook
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total playbooks", value: stats.total, icon: BookOpen, colour: "text-blue-600 bg-blue-50" },
          { label: "Harmonised", value: stats.harmonised, icon: GitMerge, colour: "text-green-600 bg-green-50" },
          { label: "In progress", value: stats.inProgress, icon: Sparkles, colour: "text-purple-600 bg-purple-50" },
          { label: "Team members", value: stats.members, icon: FileText, colour: "text-orange-600 bg-orange-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.colour}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Playbooks */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent playbooks</h2>
          <Link href="/dashboard/playbooks" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>

        {playbooks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                <BookOpen className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="mb-2 font-semibold text-slate-900">No playbooks yet</h3>
              <p className="mb-6 max-w-sm text-sm text-slate-500">
                Create your first playbook to start harmonising contracts with AI.
              </p>
              <Link href="/dashboard/playbooks/new">
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4" />
                  Create your first playbook
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {playbooks.map((p) => (
              <Link key={p.id} href={`/dashboard/playbooks/${p.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">{p.name}</p>
                        <Badge className={STATUS_COLOURS[p.status]} variant="secondary">
                          {p.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {p._count.contracts} contract{p._count.contracts !== 1 ? "s" : ""} ·{" "}
                        {p._count.clauseGroups} clause group{p._count.clauseGroups !== 1 ? "s" : ""} ·{" "}
                        {formatRelativeTime(p.createdAt)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
