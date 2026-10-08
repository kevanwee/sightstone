import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ANALYSIS_LEASE_MS } from "@/lib/analysis-validation";

export const WRITE_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export function playbookWhere(id: string, userId: string, write = false) {
  return {
    id,
    organisation: {
      members: {
        some: {
          userId,
          ...(write ? { role: { in: [...WRITE_ROLES] } } : {}),
        },
      },
    },
  };
}

export class PlaybookError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function playbookErrorResponse(error: unknown) {
  if (error instanceof PlaybookError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  // Do not log uploaded text or model responses.
  return NextResponse.json(
    { error: "The operation failed. Please retry." },
    { status: 500 },
  );
}

export async function requirePlaybook(
  id: string,
  userId: string,
  write = false,
  client: Prisma.TransactionClient = db,
) {
  const playbook = await client.playbook.findFirst({
    where: playbookWhere(id, userId, write),
  });
  if (!playbook) {
    throw new PlaybookError(404, "Playbook not found or access denied");
  }
  return playbook;
}

/** All mutations take the same row lock; analysis operates against a stable snapshot. */
export async function withPlaybookWrite<T>(
  id: string,
  userId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    const current = await requirePlaybook(id, userId, true, tx);
    if (
      current.status === "ANALYSING" &&
      Date.now() - current.updatedAt.getTime() < ANALYSIS_LEASE_MS
    ) {
      throw new PlaybookError(
        409,
        "Analysis is running. Wait for it to finish.",
      );
    }
    const locked = await tx.playbook.updateMany({
      where: {
        ...playbookWhere(id, userId, true),
        status: current.status,
        updatedAt: current.updatedAt,
      },
      data: {
        updatedAt: new Date(
          Math.max(Date.now(), current.updatedAt.getTime() + 1),
        ),
        ...(current.status === "ANALYSING" ? { status: "DRAFT" as const } : {}),
      },
    });
    if (!locked.count) {
      throw new PlaybookError(409, "Playbook changed. Refresh and retry.");
    }
    return action(tx);
  });
}
