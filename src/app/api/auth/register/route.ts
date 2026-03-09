import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const RegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name, email, password, orgName } = parsed.data;

    // Check if email already in use
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create user + organisation + membership in one transaction
    const result = await db.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: { name, email, passwordHash },
      });

      // Create organisation with unique slug
      let slug = slugify(orgName);
      const slugExists = await tx.organisation.findUnique({ where: { slug } });
      if (slugExists) slug = `${slug}-${Date.now()}`;

      const org = await tx.organisation.create({
        data: { name: orgName, slug },
      });

      // Add user as OWNER
      await tx.organisationMember.create({
        data: { userId: user.id, organisationId: org.id, role: "OWNER" },
      });

      return { user, org };
    });

    return NextResponse.json(
      { message: "Account created", userId: result.user.id, orgId: result.org.id },
      { status: 201 }
    );
  } catch (err) {
    console.error("[REGISTER]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
