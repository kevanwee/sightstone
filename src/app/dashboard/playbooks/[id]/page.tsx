import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { PlaybookDetail } from "@/components/playbooks/playbook-detail";

export default async function PlaybookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const playbook = await db.playbook.findUnique({
    where: { id },
    include: {
      contracts: {
        include: { _count: { select: { clauses: true } } },
        orderBy: { createdAt: "asc" },
      },
      clauseGroups: {
        include: {
          clauses: {
            include: { contract: { select: { id: true, name: true } } },
          },
        },
        orderBy: { clauseType: "asc" },
      },
      organisation: { select: { id: true, name: true } },
    },
  });

  if (!playbook) notFound();

  return <PlaybookDetail playbook={playbook as never} />;
}
