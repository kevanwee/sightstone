import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { analysePlaybook } from "@/lib/analysis";
import { ANALYSIS_LEASE_MS } from "@/lib/analysis-validation";
import { requirePlaybook, playbookErrorResponse } from "@/lib/playbook-access";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const { id } = await params;
    return NextResponse.json(await analysePlaybook(id, session.user.id));
  } catch (error) {
    return playbookErrorResponse(error);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const playbook = await requirePlaybook(id, session.user.id);
    const recoverable =
      playbook.status === "ANALYSING" &&
      Date.now() - playbook.updatedAt.getTime() >= ANALYSIS_LEASE_MS;
    return NextResponse.json({ status: playbook.status, recoverable });
  } catch (error) {
    return playbookErrorResponse(error);
  }
}
