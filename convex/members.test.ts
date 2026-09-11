import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asApplicant, asClerk, seedCity } from "../testFixtures";

const modules = import.meta.glob("./**/*.ts");

describe("members.setEmail", () => {
  it("stores a trimmed address for the member", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const clerk = await asClerk(t);
    await clerk.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "  bo@example.com " });
    const member = await t.run(async (ctx) => ctx.db.get(fixture.memberId));
    expect(member?.email).toBe("bo@example.com");
  });

  it("rejects an address that is not one", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const clerk = await asClerk(t);
    await expect(clerk.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "bo" })).rejects.toThrow(
      "valid email",
    );
    const member = await t.run(async (ctx) => ctx.db.get(fixture.memberId));
    expect(member?.email).toBeUndefined();
  });

  it("is closed to anyone but a clerk", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    await expect(
      t.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "bo@example.com" }),
    ).rejects.toThrow("Sign in required");
    const applicant = await asApplicant(t);
    await expect(
      applicant.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "bo@example.com" }),
    ).rejects.toThrow("Clerk role required");
  });
});
