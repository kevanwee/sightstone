import { expect, it } from "vitest";
import { isPublicPath } from "@/lib/public-path";

it("does not treat every path as public because it starts with a slash", () => {
  for (const path of [
    "/",
    "/login",
    "/register",
    "/api/auth",
    "/api/auth/callback/credentials",
  ]) {
    expect(isPublicPath(path)).toBe(true);
  }
  for (const path of [
    "/dashboard",
    "/dashboard/playbooks/123",
    "/api/playbooks",
    "/login-private",
    "/api/authentication",
  ]) {
    expect(isPublicPath(path)).toBe(false);
  }
});
