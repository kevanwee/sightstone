import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organisationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organisation: {
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!membership) redirect("/register");

  return (
    <SettingsForm
      user={session.user as { id: string; name?: string | null; email?: string | null }}
      organisation={membership.organisation}
      role={membership.role}
    />
  );
}
