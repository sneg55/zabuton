import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asApplicant, asClerk, flushMail, seedCity, type TestConvex } from "../testFixtures";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AGENTMAIL_API_KEY", "");
});

async function draftFor(t: TestConvex, seatId: Id<"seats">): Promise<Id<"notices">> {
  const clerk = await asClerk(t);
  return clerk.action(api.notices.draft, { seatId, kind: "term_expiry" });
}

describe("notices.draft", () => {
  it("writes the template notice when no OpenAI key is set", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const noticeId = await draftFor(t, fixture.seatId);
    const notice = await t.run(async (ctx) => ctx.db.get(noticeId));
    expect(notice?.status).toBe("draft");
    expect(notice?.subject).toBe("Your term on the Planning Commission, Seat 1 is ending");
    expect(notice?.body).toContain("Dear Bo Ito,");
    expect(notice?.body).toContain("ends on 12/26");
    expect(notice?.body).not.toMatch(/[—–]/);
    expect(notice?.memberId).toBe(fixture.memberId);
    expect(notice?.bodyId).toBe(fixture.bodyId);
  });

  it("refuses a seat with no sitting member", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const clerk = await asClerk(t);
    await expect(clerk.action(api.notices.draft, { seatId: fixture.otherSeatId, kind: "term_expiry" })).rejects.toThrow(
      "no current member",
    );
  });

  it("requires the clerk role", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const applicant = await asApplicant(t);
    await expect(applicant.action(api.notices.draft, { seatId: fixture.seatId, kind: "term_expiry" })).rejects.toThrow(
      "Clerk role required",
    );
  });
});

describe("notices.list", () => {
  it("joins the body name, member name and member email", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    await draftFor(t, fixture.seatId);
    const before = await t.query(api.notices.list, { cityId: fixture.cityId });
    expect(before[0].bodyName).toBe("Planning Commission");
    expect(before[0].memberName).toBe("Bo Ito");
    expect(before[0].memberEmail).toBeNull();
    const clerk = await asClerk(t);
    await clerk.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "bo@example.com" });
    const after = await t.query(api.notices.list, { cityId: fixture.cityId });
    expect(after[0].memberEmail).toBe("bo@example.com");
  });
});

describe("notices.approve", () => {
  it("throws when the member has no email and sends nothing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const noticeId = await draftFor(t, fixture.seatId);
    const clerk = await asClerk(t);
    await expect(clerk.mutation(api.notices.approve, { noticeId })).rejects.toThrow("Member has no email");
    const notice = await t.run(async (ctx) => ctx.db.get(noticeId));
    expect(notice?.status).toBe("draft");
    const messages = await t.run(async (ctx) => ctx.db.query("messages").collect());
    expect(messages).toEqual([]);
  });

  it("requires the clerk role", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const noticeId = await draftFor(t, fixture.seatId);
    await expect(t.mutation(api.notices.approve, { noticeId })).rejects.toThrow("Sign in required");
  });

  it("marks the notice failed when mail is not configured", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const noticeId = await draftFor(t, fixture.seatId);
    const clerk = await asClerk(t);
    await clerk.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "bo@example.com" });
    await clerk.mutation(api.notices.approve, { noticeId });
    const approved = await t.run(async (ctx) => ctx.db.get(noticeId));
    expect(approved?.status).toBe("approved");
    expect(approved?.approvedAt).toBeGreaterThan(0);
    await flushMail(t);
    const notice = await t.run(async (ctx) => ctx.db.get(noticeId));
    expect(notice?.status).toBe("failed");
    expect(notice?.error).toBe("email not configured");
    const threads = await t.run(async (ctx) => ctx.db.query("threads").collect());
    expect(threads).toEqual([]);
  });

  it("refuses a second approval of the same notice", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const noticeId = await draftFor(t, fixture.seatId);
    const clerk = await asClerk(t);
    await clerk.mutation(api.members.setEmail, { memberId: fixture.memberId, email: "bo@example.com" });
    await clerk.mutation(api.notices.approve, { noticeId });
    await expect(clerk.mutation(api.notices.approve, { noticeId })).rejects.toThrow("already approved");
    await flushMail(t);
  });
});

describe("notices.discard", () => {
  it("removes a draft notice", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    const noticeId = await draftFor(t, fixture.seatId);
    const clerk = await asClerk(t);
    await clerk.mutation(api.notices.discard, { noticeId });
    expect(await t.run(async (ctx) => ctx.db.get(noticeId))).toBeNull();
    expect(await t.query(api.notices.list, { cityId: fixture.cityId })).toEqual([]);
  });
});
