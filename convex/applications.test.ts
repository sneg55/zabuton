import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asApplicant, asClerk, flushMail, seedCity } from "../testFixtures";

const modules = import.meta.glob("./**/*.ts");

const YEAR_MS = 365 * 86_400_000;

function newTest() {
  return convexTest(schema, modules);
}

async function submitOne(t: ReturnType<typeof newTest>, seatId?: string) {
  return t.mutation(api.applications.submit, {
    citySlug: "dublin",
    seatId: seatId as never,
    applicantName: "Ada Reyes",
    email: "ada@example.com",
    statement: "I have chaired the neighborhood association for six years.",
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AGENTMAIL_API_KEY", "");
});

describe("applications.submit", () => {
  it("records the application and a received event", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    const detail = await t.query(api.applications.get, { applicationId });
    expect(detail?.application.state).toBe("received");
    expect(detail?.application.cityId).toBe(fixture.cityId);
    expect(detail?.application.bodyId).toBe(fixture.bodyId);
    expect(detail?.body?.name).toBe("Planning Commission");
    expect(detail?.seat?.label).toBe("Seat 1");
    expect(detail?.events[0].state).toBe("received");
  });

  it("does not fail the applicant when no inbox exists", async () => {
    const t = newTest();
    await seedCity(t);
    const applicationId = await submitOne(t);
    await flushMail(t);
    const detail = await t.query(api.applications.get, { applicationId });
    expect(detail?.application.threadId).toBeUndefined();
    expect(detail?.events.map((event) => event.note)).toEqual(["Application received", "email not configured"]);
    expect(detail?.messages).toEqual([]);
  });

  it("degrades the same way when the city has an inbox but no API key", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    await t.run(async (ctx) => ctx.db.patch(fixture.cityId, { inboxId: "inbox_1", inboxAddress: "dublin@agentmail.to" }));
    const applicationId = await submitOne(t, fixture.seatId);
    await flushMail(t);
    const detail = await t.query(api.applications.get, { applicationId });
    expect(detail?.application.threadId).toBeUndefined();
    expect(detail?.events[1].note).toBe("email not configured");
  });

  it("caps one email at 3 applications a day and a city at 50", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    await submitOne(t, fixture.seatId);
    await submitOne(t, fixture.seatId);
    await submitOne(t, fixture.seatId);
    await expect(submitOne(t, fixture.seatId)).rejects.toThrow(/already sent 3/);
    await t.run(async (ctx) => {
      for (let i = 0; i < 47; i += 1) {
        await ctx.db.insert("applications", { cityId: fixture.cityId, applicantName: `R${i}`, email: `r${i}@example.org`, statement: "x", state: "received", updatedAt: Date.now() });
      }
    });
    await expect(
      t.mutation(api.applications.submit, { citySlug: "dublin", applicantName: "Zed", email: "zed@example.org", statement: "I would like to serve on this commission." }),
    ).rejects.toThrow(/as many applications/);
  });

  it("rejects an unknown city and a malformed email", async () => {
    const t = newTest();
    await seedCity(t);
    await expect(
      t.mutation(api.applications.submit, {
        citySlug: "nowhere",
        applicantName: "Ada",
        email: "ada@example.com",
        statement: "hello",
      }),
    ).rejects.toThrow("City not found");
    await expect(
      t.mutation(api.applications.submit, {
        citySlug: "dublin",
        applicantName: "Ada",
        email: "ada-at-example",
        statement: "hello",
      }),
    ).rejects.toThrow("valid email");
  });
});

describe("applications.list", () => {
  it("joins the body name, seat label and the last event", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    await submitOne(t, fixture.seatId);
    await flushMail(t);
    const rows = await t.query(api.applications.list, { cityId: fixture.cityId });
    expect(rows).toHaveLength(1);
    expect(rows[0].bodyName).toBe("Planning Commission");
    expect(rows[0].seatLabel).toBe("Seat 1");
    expect(rows[0].lastEvent?.note).toBe("email not configured");
  });
});

describe("applications.setState", () => {
  it("requires the clerk role", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    await expect(t.mutation(api.applications.setState, { applicationId, state: "under_review" })).rejects.toThrow(
      "Sign in required",
    );
    const applicant = await asApplicant(t);
    await expect(
      applicant.mutation(api.applications.setState, { applicationId, state: "under_review" }),
    ).rejects.toThrow("Clerk role required");
  });

  it("moves the state and appends an event without touching the roster", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    const clerk = await asClerk(t);
    await clerk.mutation(api.applications.setState, { applicationId, state: "under_review", note: "Queued" });
    const detail = await t.query(api.applications.get, { applicationId });
    expect(detail?.application.state).toBe("under_review");
    expect(detail?.events.at(-1)?.note).toBe("Queued");
    const members = await t.run(async (ctx) => ctx.db.query("members").collect());
    expect(members).toHaveLength(1);
  });

  it("appoints the applicant onto the seat and ends the sitting term", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    const clerk = await asClerk(t);
    const before = Date.now();
    await clerk.mutation(api.applications.setState, { applicationId, state: "appointed" });
    const after = Date.now();
    const board = await t.query(api.roster.board, { bodyId: fixture.bodyId, now: before });
    const seatRow = board?.seats.find((row) => row.seat._id === fixture.seatId);
    expect(seatRow?.member?.name).toBe("Ada Reyes");
    expect(seatRow?.member?.email).toBe("ada@example.com");
    expect(seatRow?.term?.sourceUrl).toBe(`application:${applicationId}`);
    expect(seatRow?.term?.snippet).toMatch(/^Appointed via application on \d{4}-\d{2}-\d{2}$/);
    expect(seatRow?.term?.startsAt).toBeGreaterThanOrEqual(before);
    expect(seatRow?.term?.startsAt).toBeLessThanOrEqual(after);
    const endsAt = seatRow?.term?.endsAt ?? 0;
    expect(endsAt - (seatRow?.term?.startsAt ?? 0)).toBeGreaterThan(3.9 * YEAR_MS);
    expect(endsAt - (seatRow?.term?.startsAt ?? 0)).toBeLessThan(4.1 * YEAR_MS);
    const previous = await t.run(async (ctx) => ctx.db.get(fixture.termId));
    expect(previous?.current).toBe(false);
  });

  it("leaves the term open ended when the body publishes no year count", async () => {
    const t = newTest();
    const fixture = await seedCity(t, "at the pleasure of the council");
    const applicationId = await submitOne(t, fixture.seatId);
    const clerk = await asClerk(t);
    await clerk.mutation(api.applications.setState, { applicationId, state: "appointed" });
    const terms = await t.run(async (ctx) =>
      ctx.db
        .query("terms")
        .withIndex("by_seat", (q) => q.eq("seatId", fixture.seatId))
        .collect(),
    );
    const current = terms.find((term) => term.current);
    expect(current?.endsAt).toBeUndefined();
  });

  it("writes no member when the application names no seat", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t);
    const clerk = await asClerk(t);
    await clerk.mutation(api.applications.setState, { applicationId, state: "appointed" });
    const members = await t.run(async (ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_city", (q) => q.eq("cityId", fixture.cityId))
        .collect(),
    );
    expect(members.map((member) => member.name)).toEqual(["Bo Ito"]);
  });

  it("records the reply on the event and notes that mail is unconfigured", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    const clerk = await asClerk(t);
    await clerk.mutation(api.applications.setState, {
      applicationId,
      state: "declined",
      replyText: "Thank you for applying.",
    });
    await flushMail(t);
    const detail = await t.query(api.applications.get, { applicationId });
    const withReply = detail?.events.find((event) => event.replyText !== undefined);
    expect(withReply?.replyText).toBe("Thank you for applying.");
    expect(detail?.events.at(-1)?.note).toBe("email not configured");
  });
});

describe("applications.draftReply", () => {
  it("falls back to the template when no OpenAI key is set", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    const clerk = await asClerk(t);
    const { text } = await clerk.action(api.applications.draftReply, { applicationId, state: "interviewed" });
    expect(text).toContain("Dear Ada Reyes,");
    expect(text).toContain("Thank you for your interview");
    expect(text).toContain("Seat 1 seat on the Planning Commission");
    expect(text).not.toMatch(/[—–]/);
  });

  it("requires the clerk role", async () => {
    const t = newTest();
    const fixture = await seedCity(t);
    const applicationId = await submitOne(t, fixture.seatId);
    await expect(t.action(api.applications.draftReply, { applicationId, state: "declined" })).rejects.toThrow(
      "Sign in required",
    );
  });
});
