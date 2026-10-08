import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { analysePlaybook } from "@/lib/analysis";
import { ANALYSIS_LEASE_MS } from "@/lib/analysis-validation";
import { withPlaybookWrite } from "@/lib/playbook-access";
import { extractClausesFromText, compareClauses } from "@/lib/ai";
import * as detail from "@/app/api/playbooks/[id]/route";
import * as contracts from "@/app/api/playbooks/[id]/contracts/route";
import * as harmonise from "@/app/api/playbooks/[id]/harmonise/route";
import * as analysis from "@/app/api/playbooks/[id]/analyse/route";
import * as exporting from "@/app/api/playbooks/[id]/export/route";

const identity = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: identity.userId } })),
}));
vi.mock("@/lib/ai", () => ({
  extractClausesFromText: vi.fn(),
  compareClauses: vi.fn(),
}));

// CI supplies a dedicated disposable PostgreSQL service. Never use a developer's DB.
describe.runIf(process.env.RUN_DATABASE_TESTS === "1")(
  "playbook isolation and atomic analysis (PostgreSQL)",
  () => {
    let orgId: string,
      otherOrgId: string,
      ownerId: string,
      outsiderId: string,
      viewerId: string;
    let id: string,
      contractId: string,
      otherContractId: string,
      groupId: string;
    const text = "Payment is due in 30 days.";
    const extracted = {
      clauses: [
        {
          originalText: text,
          clauseType: "Payment",
          contractualEffect: "OBLIGATION" as const,
          riskLevel: "LOW" as const,
          position: 1,
        },
      ],
    };
    const params = () => ({ params: Promise.resolve({ id }) });
    const request = (method = "GET", body?: object) =>
      new NextRequest(`http://localhost/api/playbooks/${id}`, {
        method,
        ...(body
          ? {
              body: JSON.stringify(body),
              headers: { "Content-Type": "application/json" },
            }
          : {}),
      });

    beforeAll(async () => {
      if (!process.env.DATABASE_URL?.includes("sightstone_test")) {
        throw new Error(
          "Integration tests require an isolated sightstone_test database",
        );
      }
      const token = randomUUID();
      const owner = await db.user.create({
        data: { email: `owner-${token}@example.invalid` },
      });
      const outsider = await db.user.create({
        data: { email: `outsider-${token}@example.invalid` },
      });
      const viewer = await db.user.create({
        data: { email: `viewer-${token}@example.invalid` },
      });
      ownerId = owner.id;
      outsiderId = outsider.id;
      viewerId = viewer.id;
      const org = await db.organisation.create({
        data: {
          name: "Fixture",
          slug: `fixture-${token}`,
          members: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: viewerId, role: "VIEWER" },
            ],
          },
        },
      });
      const other = await db.organisation.create({
        data: {
          name: "Other fixture",
          slug: `other-${token}`,
          members: { create: { userId: outsiderId, role: "OWNER" } },
        },
      });
      orgId = org.id;
      otherOrgId = other.id;
      const otherBook = await db.playbook.create({
        data: {
          name: "Other",
          organisationId: other.id,
          createdById: outsiderId,
          contracts: {
            create: {
              name: "other",
              fileType: "txt",
              rawText: text,
              status: "PROCESSED",
            },
          },
        },
        include: { contracts: true },
      });
      otherContractId = otherBook.contracts[0].id;
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      identity.userId = ownerId;
      const book = await db.playbook.create({
        data: {
          name: "Fixture",
          organisationId: orgId,
          createdById: ownerId,
          status: "HARMONISED",
          contracts: {
            create: [1, 2].map(() => ({
              name: "same-name",
              fileType: "txt",
              rawText: text,
              status: "PROCESSED",
            })),
          },
          clauseGroups: {
            create: {
              clauseType: "Previous",
              contractualEffect: "OTHER",
              chosenWording: "Keep this decision",
              harmonisationStatus: "FINALISED",
            },
          },
        },
        include: { contracts: true, clauseGroups: true },
      });
      id = book.id;
      contractId = book.contracts[0].id;
      groupId = book.clauseGroups[0].id;
      vi.mocked(extractClausesFromText).mockResolvedValue(extracted);
      vi.mocked(compareClauses).mockResolvedValue({
        clauseType: "Payment",
        contractualEffect: "OBLIGATION",
        overlapSummary: "Same payment",
        similarities: [],
        differences: [],
        aiSuggestedWording: text,
      });
    });
    afterAll(async () => {
      if (orgId) {
        await db.organisation.delete({ where: { id: orgId } });
      }
      if (otherOrgId) {
        await db.organisation.delete({ where: { id: otherOrgId } });
      }
      await db.user.deleteMany({
        where: { id: { in: [ownerId, outsiderId, viewerId].filter(Boolean) } },
      });
      await db.$disconnect();
    });

    it("denies outsiders every read surface, including export and status", async () => {
      identity.userId = outsiderId;
      for (const handler of [
        detail.GET,
        contracts.GET,
        harmonise.GET,
        analysis.GET,
        exporting.GET,
      ]) {
        const response = await handler(request(), params());
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain("Keep this decision");
      }
    });
    it("denies outsiders and viewers all write surfaces", async () => {
      for (const user of [outsiderId, viewerId]) {
        identity.userId = user;
        expect(
          (await detail.PATCH(request("PATCH", { name: "stolen" }), params()))
            .status,
        ).toBe(404);
        expect((await detail.DELETE(request("DELETE"), params())).status).toBe(
          404,
        );
        expect((await contracts.POST(request("POST"), params())).status).toBe(
          404,
        );
        expect(
          (
            await harmonise.POST(
              request("POST", {
                groupId,
                action: "custom",
                customWording: "stolen",
              }),
              params(),
            )
          ).status,
        ).toBe(404);
        expect((await analysis.POST(request("POST"), params())).status).toBe(
          404,
        );
      }
      expect(
        (await db.playbook.findUniqueOrThrow({ where: { id } })).name,
      ).toBe("Fixture");
      expect(extractClausesFromText).not.toHaveBeenCalled();
    });
    it("allows viewers to read and rejects a contract ID from a different playbook", async () => {
      identity.userId = viewerId;
      expect((await detail.GET(request(), params())).status).toBe(200);
      identity.userId = ownerId;
      const response = await contracts.DELETE(
        new NextRequest(
          `http://localhost/api/playbooks/${id}/contracts?contractId=${otherContractId}`,
          { method: "DELETE" },
        ),
        params(),
      );
      expect(response.status).toBe(404);
      expect(
        await db.contract.findUnique({ where: { id: otherContractId } }),
      ).not.toBeNull();
    });
    it("preserves saved decisions on model failure and restores the previous status", async () => {
      vi.mocked(compareClauses).mockRejectedValue(
        new Error("synthetic provider failure"),
      );
      await expect(analysePlaybook(id, ownerId)).rejects.toMatchObject({
        status: 502,
      });
      expect(
        (await db.clauseGroup.findUniqueOrThrow({ where: { id: groupId } }))
          .chosenWording,
      ).toBe("Keep this decision");
      expect(
        (await db.playbook.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("HARMONISED");
    });
    it("rejects oversized input before claiming or calling a model", async () => {
      await db.contract.update({
        where: { id: contractId },
        data: { rawText: "a".repeat(15001) },
      });
      await expect(analysePlaybook(id, ownerId)).rejects.toMatchObject({
        status: 400,
      });
      expect(extractClausesFromText).not.toHaveBeenCalled();
      expect(
        (await db.playbook.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("HARMONISED");
    });
    it("commits complete replacement results and retains distinct contract IDs with duplicate names", async () => {
      await expect(analysePlaybook(id, ownerId)).resolves.toEqual({
        status: "REVIEW",
      });
      const clauses = await db.clause.findMany({
        where: { contract: { playbookId: id } },
      });
      expect(new Set(clauses.map((c) => c.contractId)).size).toBe(2);
      expect(
        await db.clauseGroup.findUnique({ where: { id: groupId } }),
      ).toBeNull();
    });
    it("rejects duplicate analysis and edits while a request owns the lease", async () => {
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.mocked(extractClausesFromText).mockImplementation(async () => {
        entered();
        await blocked;
        return extracted;
      });
      const running = analysePlaybook(id, ownerId);
      await started;
      try {
        await expect(analysePlaybook(id, ownerId)).rejects.toMatchObject({
          status: 409,
        });
        await expect(
          withPlaybookWrite(id, ownerId, (tx) =>
            tx.playbook.update({
              where: { id },
              data: { name: "racing edit" },
            }),
          ),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        release();
      }
      await running;
    });
    it("does not let a superseded worker overwrite newer results", async () => {
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.mocked(extractClausesFromText).mockImplementationOnce(async () => {
        entered();
        await blocked;
        return extracted;
      });
      const oldAttempt = analysePlaybook(id, ownerId).catch((error) => error);
      await started;
      await db.playbook.update({
        where: { id },
        data: { updatedAt: new Date(Date.now() - ANALYSIS_LEASE_MS - 1000) },
      });
      try {
        await analysePlaybook(id, ownerId);
      } finally {
        release();
      }
      expect(await oldAttempt).toMatchObject({ status: 409 });
      expect(
        (await db.playbook.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("REVIEW");
      expect(
        await db.clause.count({ where: { contract: { playbookId: id } } }),
      ).toBe(2);
    });
    it("rolls back deletion of previous results when saving replacement data fails", async () => {
      vi.mocked(extractClausesFromText).mockResolvedValue({
        clauses: [{ ...extracted.clauses[0], position: NaN }],
      });
      await expect(analysePlaybook(id, ownerId)).rejects.toMatchObject({
        status: 502,
      });
      expect(
        (await db.clauseGroup.findUniqueOrThrow({ where: { id: groupId } }))
          .chosenWording,
      ).toBe("Keep this decision");
      expect(
        (await db.playbook.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("HARMONISED");
    });
    it("rejects arbitrary status changes and invalid uploads without partial writes", async () => {
      expect(
        (
          await detail.PATCH(
            request("PATCH", { status: "ANALYSING" }),
            params(),
          )
        ).status,
      ).toBe(400);
      const form = new FormData();
      form.append("files", new File([text], "valid.txt"));
      form.append("files", new File([text], "legacy.doc"));
      const response = await contracts.POST(
        new NextRequest(`http://localhost/api/playbooks/${id}/contracts`, {
          method: "POST",
          body: form,
        }),
        params(),
      );
      expect(response.status).toBe(400);
      expect(await db.contract.count({ where: { playbookId: id } })).toBe(2);
    });
    it("allows invalid legacy input to be removed after an analysis lease expires", async () => {
      await db.playbook.update({
        where: { id },
        data: {
          status: "ANALYSING",
          updatedAt: new Date(Date.now() - ANALYSIS_LEASE_MS - 1000),
        },
      });
      await db.contract.update({
        where: { id: contractId },
        data: { rawText: "", status: "ERROR" },
      });
      const response = await contracts.DELETE(
        new NextRequest(
          `http://localhost/api/playbooks/${id}/contracts?contractId=${contractId}`,
          { method: "DELETE" },
        ),
        params(),
      );
      expect(response.status).toBe(200);
      expect(
        (await db.playbook.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("DRAFT");
    });
    it("recovers interrupted legacy analysis and PROCESSING contracts", async () => {
      await db.playbook.update({
        where: { id },
        data: {
          status: "ANALYSING",
          updatedAt: new Date(Date.now() - ANALYSIS_LEASE_MS - 1000),
        },
      });
      await db.contract.update({
        where: { id: contractId },
        data: { status: "PROCESSING" },
      });
      const status = await analysis.GET(request(), params());
      expect(await status.json()).toMatchObject({ recoverable: true });
      await expect(analysePlaybook(id, ownerId)).resolves.toEqual({
        status: "REVIEW",
      });
      expect(
        (await db.contract.findUniqueOrThrow({ where: { id: contractId } }))
          .status,
      ).toBe("PROCESSED");
    });
  },
);
