import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { wipeCityRows } from "./cities";
import { confirmDraft } from "./drafts";
import { inboxDisplayName } from "./mail";
import { cleanRole, isGenericBodyName } from "./lib/draftTypes";
import { isVacancyName } from "./lib/seatStatus";

export const setTermEnd = internalMutation({
  args: { bodyName: v.string(), ordinal: v.number(), endsAt: v.union(v.number(), v.null()) },
  handler: async (ctx, { bodyName, ordinal, endsAt }) => {
    const body = (await ctx.db.query("bodies").collect()).find((b) => b.name === bodyName);
    if (!body) throw new ConvexError("no body " + bodyName);
    const seat = (await ctx.db.query("seats").withIndex("by_body", (q) => q.eq("bodyId", body._id)).collect()).find((s) => s.ordinal === ordinal);
    if (!seat) throw new ConvexError("no seat " + ordinal);
    const term = (await ctx.db.query("terms").withIndex("by_seat", (q) => q.eq("seatId", seat._id)).collect()).find((t) => t.current);
    if (!term) throw new ConvexError("no current term");
    await ctx.db.patch(term._id, { endsAt: endsAt ?? undefined });
    return term._id;
  },
});

export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("clerk"), v.literal("applicant")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
    if (!user) throw new ConvexError("no user " + email);
    await ctx.db.patch(user._id, { role });
    return user._id;
  },
});

export const renameCity = internalMutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, { slug, name }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    await ctx.db.patch(city._id, { name });
    return city._id;
  },
});

export const pruneGenericDrafts = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    const drafts = await ctx.db.query("drafts").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect();
    let n = 0;
    for (const d of drafts) {
      if (d.status === "pending" && isGenericBodyName(d.name)) {
        await ctx.db.patch(d._id, { status: "dismissed" });
        n += 1;
      }
    }
    return n;
  },
});

export const confirmCity = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    await ctx.db.patch(city._id, { status: "confirmed" });
    const bodies = await ctx.db.query("bodies").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect();
    for (const b of bodies) await ctx.db.patch(b._id, { confirmed: true });
    return bodies.length;
  },
});

export const wipeCity = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    return wipeCityRows(ctx, city);
  },
});

const OPEN_ENDED = /^9\d{3}-\d{2}-\d{2}/;

export const fixOpenEndedTerms = internalMutation({
  args: {},
  handler: async (ctx) => {
    let terms = 0;
    for (const term of await ctx.db.query("terms").collect()) {
      if (!term.rawEnd || !OPEN_ENDED.test(term.rawEnd)) continue;
      await ctx.db.patch(term._id, { endsAt: undefined, rawEnd: undefined, snippet: term.snippet.replace(/-> 9\d{3}-\d{2}-\d{2}/, "-> open-ended") });
      terms += 1;
    }
    let drafts = 0;
    for (const draft of await ctx.db.query("drafts").collect()) {
      if (!draft.members.some((m) => m.termEnd && OPEN_ENDED.test(m.termEnd))) continue;
      await ctx.db.patch(draft._id, {
        members: draft.members.map((m) => (m.termEnd && OPEN_ENDED.test(m.termEnd) ? { ...m, termEnd: null, snippet: m.snippet.replace(/-> 9\d{3}-\d{2}-\d{2}/, "-> open-ended") } : m)),
      });
      drafts += 1;
    }
    let flags = 0;
    for (const flag of await ctx.db.query("driftFlags").collect()) {
      if (flag.status !== "open" || !OPEN_ENDED.test(flag.tracked)) continue;
      await ctx.db.patch(flag._id, { status: "resolved", resolvedAt: Date.now() });
      flags += 1;
    }
    return { terms, drafts, flags };
  },
});

export const convertVacantMembers = internalMutation({
  args: {},
  handler: async (ctx) => {
    let converted = 0;
    for (const member of await ctx.db.query("members").collect()) {
      if (!isVacancyName(member.name)) continue;
      const terms = (await ctx.db.query("terms").collect()).filter((t) => t.memberId === member._id);
      for (const term of terms) {
        await ctx.db.patch(term.seatId, { vacant: true });
        await ctx.db.delete(term._id);
      }
      await ctx.db.delete(member._id);
      converted += 1;
    }
    return converted;
  },
});

async function cityBySlug(ctx: MutationCtx, slug: string) {
  const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
  if (!city) throw new ConvexError("no city " + slug);
  return city;
}

export const removeBody = internalMutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, { slug, name }) => {
    const city = await cityBySlug(ctx, slug);
    const body = (await ctx.db.query("bodies").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()).find((b) => b.name === name);
    if (!body) throw new ConvexError("no body " + name);
    for (const seat of await ctx.db.query("seats").withIndex("by_body", (q) => q.eq("bodyId", body._id)).collect()) {
      for (const term of await ctx.db.query("terms").withIndex("by_seat", (q) => q.eq("seatId", seat._id)).collect()) {
        await ctx.db.delete(term._id);
        await ctx.db.delete(term.memberId);
      }
      await ctx.db.delete(seat._id);
    }
    for (const flag of await ctx.db.query("driftFlags").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (flag.bodyId === body._id) await ctx.db.delete(flag._id);
    }
    for (const notice of await ctx.db.query("notices").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (notice.bodyId === body._id) await ctx.db.delete(notice._id);
    }
    await ctx.db.delete(body._id);
    return body._id;
  },
});

export const deleteApplications = internalMutation({
  args: { slug: v.string(), email: v.string() },
  handler: async (ctx, { slug, email }) => {
    const city = await cityBySlug(ctx, slug);
    let n = 0;
    for (const app of await ctx.db.query("applications").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (app.email !== email) continue;
      for (const event of await ctx.db.query("applicationEvents").withIndex("by_application", (q) => q.eq("applicationId", app._id)).collect()) await ctx.db.delete(event._id);
      for (const thread of await ctx.db.query("threads").withIndex("by_application", (q) => q.eq("applicationId", app._id)).collect()) {
        for (const message of await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", thread._id)).collect()) await ctx.db.delete(message._id);
        await ctx.db.delete(thread._id);
      }
      await ctx.db.delete(app._id);
      n += 1;
    }
    return n;
  },
});

export const clearMemberEmail = internalMutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, { slug, name }) => {
    const city = await cityBySlug(ctx, slug);
    const member = (await ctx.db.query("members").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()).find((m) => m.name === name);
    if (!member) throw new ConvexError("no member " + name);
    await ctx.db.patch(member._id, { email: undefined });
    let notices = 0;
    for (const notice of await ctx.db.query("notices").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (notice.memberId === member._id) {
        await ctx.db.delete(notice._id);
        notices += 1;
      }
    }
    return notices;
  },
});

export const setCityStatus = internalMutation({
  args: { slug: v.string(), status: v.union(v.literal("draft"), v.literal("confirmed")) },
  handler: async (ctx, { slug, status }) => {
    const city = await cityBySlug(ctx, slug);
    await ctx.db.patch(city._id, { status });
    return city._id;
  },
});

export const cleanSeatLabels = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const seat of await ctx.db.query("seats").collect()) {
      if (!seat.label) continue;
      const cleaned = cleanRole(seat.label);
      if (cleaned === seat.label) continue;
      await ctx.db.patch(seat._id, { label: cleaned ?? undefined });
      n += 1;
    }
    return n;
  },
});

export const dismissDraftsMatching = internalMutation({
  args: { slug: v.string(), pattern: v.string() },
  handler: async (ctx, { slug, pattern }) => {
    const city = await cityBySlug(ctx, slug);
    const re = new RegExp(pattern, "i");
    const names: string[] = [];
    for (const draft of await ctx.db.query("drafts").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (draft.status !== "pending" || !re.test(draft.name)) continue;
      await ctx.db.patch(draft._id, { status: "dismissed" });
      names.push(draft.name);
    }
    return names;
  },
});

export const confirmPendingDrafts = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await cityBySlug(ctx, slug);
    const names: string[] = [];
    for (const draft of await ctx.db.query("drafts").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (draft.status !== "pending") continue;
      await confirmDraft(ctx, draft._id);
      names.push(draft.name);
    }
    await ctx.db.patch(city._id, { status: "confirmed" });
    return names;
  },
});

export const createCityInbox = internalAction({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<{ inboxId: string; address: string | undefined }> => {
    const city: Doc<"cities"> | null = await ctx.runQuery(internal.dev.cityBySlugQuery, { slug });
    if (!city) throw new ConvexError("no city " + slug);
    if (city.inboxId) return { inboxId: city.inboxId, address: city.inboxAddress };
    const inbox = (await ctx.runAction(components.agentmail.lib.createInbox, {
      request: { username: city.slug, display_name: inboxDisplayName(city.name) },
    })) as { inbox_id?: string; email?: string } | null;
    if (!inbox?.inbox_id) throw new ConvexError("AgentMail did not return an inbox");
    await ctx.runMutation(internal.mailStore.saveInbox, { cityId: city._id, inboxId: inbox.inbox_id, address: inbox.email ?? inbox.inbox_id });
    return { inboxId: inbox.inbox_id, address: inbox.email ?? inbox.inbox_id };
  },
});

export const cityBySlugQuery = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<Doc<"cities"> | null> => ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(),
});

export const setApplicationEmail = internalMutation({
  args: { slug: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, { slug, from, to }) => {
    const city = await cityBySlug(ctx, slug);
    let n = 0;
    for (const app of await ctx.db.query("applications").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      if (app.email !== from) continue;
      await ctx.db.patch(app._id, { email: to });
      n += 1;
    }
    return n;
  },
});

export const pruneApplicationNotes = internalMutation({
  args: { slug: v.string(), note: v.string() },
  handler: async (ctx, { slug, note }) => {
    const city = await cityBySlug(ctx, slug);
    let n = 0;
    for (const app of await ctx.db.query("applications").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) {
      for (const event of await ctx.db.query("applicationEvents").withIndex("by_application", (q) => q.eq("applicationId", app._id)).collect()) {
        if (event.note !== note) continue;
        await ctx.db.delete(event._id);
        n += 1;
      }
    }
    return n;
  },
});

const QUOTED_REPLY = /\n\nOn .{0,200}wrote:\n[\s\S]*$/;

export const trimInboundQuotes = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const message of await ctx.db.query("messages").collect()) {
      if (message.direction !== "inbound" || !QUOTED_REPLY.test(message.text)) continue;
      await ctx.db.patch(message._id, { text: message.text.replace(QUOTED_REPLY, "").trim() });
      n += 1;
    }
    return n;
  },
});

export const deleteVacancyDriftFlags = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const flag of await ctx.db.query("driftFlags").collect()) {
      if (flag.status !== "open" || !isVacancyName(flag.published)) continue;
      await ctx.db.delete(flag._id);
      n += 1;
    }
    return n;
  },
});

export const setCityOwner = internalMutation({
  args: { slug: v.string(), userId: v.id("users") },
  handler: async (ctx, { slug, userId }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    await ctx.db.patch(city._id, { createdBy: userId });
    return null;
  },
});
