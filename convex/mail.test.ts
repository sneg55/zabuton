import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { seedCity, type TestConvex } from "../testFixtures";

const modules = import.meta.glob("./**/*.ts");

const AT = Date.UTC(2026, 8, 11, 17, 30, 0);

beforeEach(() => {
  vi.stubEnv("AGENTMAIL_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
});

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      inbox_id: "dublin@agentmail.to",
      thread_id: "thr_1",
      message_id: "msg_2",
      from: "ada@example.com",
      to: ["dublin@agentmail.to"],
      subject: "Re: Your application to Planning Commission",
      text: "Thank you, I can attend the January meeting.",
      timestamp: new Date(AT).toISOString(),
      ...overrides,
    },
    thread: { thread_id: "thr_1" },
    eventId: "evt_1",
  };
}

async function seedThread(t: TestConvex): Promise<{ threadId: Id<"threads">; applicationId: Id<"applications"> }> {
  const fixture = await seedCity(t);
  return t.run(async (ctx) => {
    const applicationId = await ctx.db.insert("applications", {
      cityId: fixture.cityId,
      bodyId: fixture.bodyId,
      seatId: fixture.seatId,
      applicantName: "Ada Reyes",
      email: "ada@example.com",
      statement: "I would like to serve.",
      state: "under_review",
      updatedAt: AT - 86_400_000,
    });
    const threadId = await ctx.db.insert("threads", {
      cityId: fixture.cityId,
      kind: "application",
      applicationId,
      inboxId: "dublin@agentmail.to",
      agentmailThreadId: "thr_1",
      lastMessageId: "msg_1",
      counterpartEmail: "ada@example.com",
      subject: "Your application to Planning Commission",
      lastMessageAt: AT - 86_400_000,
    });
    await ctx.db.patch(applicationId, { threadId });
    await ctx.db.insert("messages", {
      threadId,
      direction: "outbound",
      agentmailMessageId: "msg_1",
      from: "dublin@agentmail.to",
      to: "ada@example.com",
      subject: "Your application to Planning Commission",
      text: "Thank you for applying.",
      at: AT - 86_400_000,
    });
    return { threadId, applicationId };
  });
}

describe("mail.onMessageReceived", () => {
  it("appends the reply to the matching thread and wakes the application", async () => {
    const t = convexTest(schema, modules);
    const { threadId, applicationId } = await seedThread(t);
    await t.mutation(internal.mail.onMessageReceived, inbound());
    const messages = await t.query(api.mail.threadMessages, { threadId });
    expect(messages).toHaveLength(2);
    expect(messages[1].direction).toBe("inbound");
    expect(messages[1].from).toBe("ada@example.com");
    expect(messages[1].to).toBe("dublin@agentmail.to");
    expect(messages[1].text).toContain("January meeting");
    expect(messages[1].at).toBe(AT);
    const thread = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(thread?.lastMessageAt).toBe(AT);
    expect(thread?.lastMessageId).toBe("msg_2");
    const application = await t.run(async (ctx) => ctx.db.get(applicationId));
    expect(application?.updatedAt).toBe(AT);
  });

  it("ignores mail on a thread it does not track", async () => {
    const t = convexTest(schema, modules);
    const { threadId } = await seedThread(t);
    const result = await t.mutation(internal.mail.onMessageReceived, inbound({ thread_id: "thr_unknown" }));
    expect(result).toBeNull();
    expect(await t.query(api.mail.threadMessages, { threadId })).toHaveLength(1);
    const all = await t.run(async (ctx) => ctx.db.query("messages").collect());
    expect(all).toHaveLength(1);
  });

  it("ignores an event with no thread id", async () => {
    const t = convexTest(schema, modules);
    await seedThread(t);
    expect(await t.mutation(internal.mail.onMessageReceived, inbound({ thread_id: undefined }))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.query("messages").collect())).toHaveLength(1);
  });

  it("stores a redelivered message once", async () => {
    const t = convexTest(schema, modules);
    const { threadId } = await seedThread(t);
    await t.mutation(internal.mail.onMessageReceived, inbound());
    await t.mutation(internal.mail.onMessageReceived, inbound());
    expect(await t.query(api.mail.threadMessages, { threadId })).toHaveLength(2);
  });

  it("falls back to the thread's own details when the payload is thin", async () => {
    const t = convexTest(schema, modules);
    const { threadId } = await seedThread(t);
    await t.mutation(internal.mail.onMessageReceived, {
      message: { thread_id: "thr_1" },
      thread: {},
      eventId: "evt_2",
    });
    const messages = await t.query(api.mail.threadMessages, { threadId });
    expect(messages[1].from).toBe("ada@example.com");
    expect(messages[1].subject).toBe("Your application to Planning Commission");
    expect(messages[1].text).toBe("");
  });
});

describe("mail.threadMessages", () => {
  it("returns the thread in time order", async () => {
    const t = convexTest(schema, modules);
    const { threadId } = await seedThread(t);
    await t.mutation(internal.mail.onMessageReceived, inbound());
    const messages = await t.query(api.mail.threadMessages, { threadId });
    expect(messages.map((message) => message.at)).toEqual([AT - 86_400_000, AT]);
  });
});

describe("mail.status", () => {
  it("reports the AgentMail key as missing on this deployment", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.mail.status, {})).toEqual({ configured: false });
  });

  it("reports configured once a key is set", async () => {
    vi.stubEnv("AGENTMAIL_API_KEY", "am_test");
    const t = convexTest(schema, modules);
    expect(await t.action(api.mail.status, {})).toEqual({ configured: true });
  });
});

describe("mail.ensureInbox", () => {
  it("returns the stored inbox without calling AgentMail", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    await t.run(async (ctx) =>
      ctx.db.patch(fixture.cityId, { inboxId: "inbox_1", inboxAddress: "dublin@agentmail.to" }),
    );
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Clerk", role: "clerk" }));
    const clerk = t.withIdentity({ subject: `${userId}|session` });
    expect(await clerk.action(api.mail.ensureInbox, { cityId: fixture.cityId })).toEqual({
      inboxId: "inbox_1",
      address: "dublin@agentmail.to",
    });
  });

  it("requires the clerk role", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCity(t);
    await expect(t.action(api.mail.ensureInbox, { cityId: fixture.cityId })).rejects.toThrow("Sign in required");
  });
});
