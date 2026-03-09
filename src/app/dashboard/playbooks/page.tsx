import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Plus, ChevronRight, FileText, GitMerge } from "lucide-react";
import { formatDate, STATUS_COLOURS } from "@/lib/utils";

export default async function PlaybooksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organisationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organisation: {
        include: {
          playbooks: {
            include: { _count: { select: { contracts: true, clauseGroups: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!membership) redirect("/register");
  const playbooks = membership.organisation.playbooks;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Playbooks</h1>
          <p className="text-slate-500">{playbooks.length} playbook{playbooks.length !== 1 ? "s" : ""} in your organisation</p>
        </div>
        <Link href="/dashboard/playbooks/new">
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4" />
            New playbook
          </Button>
        </Link>
      </div>

      {playbooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <BookOpen className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="mb-2 font-semibold text-slate-900">No playbooks yet</h3>
            <p className="mb-6 max-w-sm text-sm text-slate-500">
              Create a playbook, upload your contracts, and let AI harmonise them for you.
            </p>
            <Link href="/dashboard/playbooks/new">
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4" />
                Create first playbook
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playbooks.map((p) => (
            <Link key={p.id} href={`/dashboard/playbooks/${p.id}`}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                    </div>
                    <Badge className={STATUS_COLOURS[p.status]} variant="secondary">
                      {p.status.toLowerCase()}
                    </Badge>
                  </div>
                  <h3 className="mb-1 font-semibold text-slate-900">{p.name}</h3>
                  <p className="mb-4 text-xs text-slate-500">{formatDate(p.createdAt)}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {p._count.contracts} contracts
                    </span>
                    <span className="flex items-center gap-1">
                      <GitMerge className="h-3.5 w-3.5" />
                      {p._count.clauseGroups} clause groups
                    </span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
