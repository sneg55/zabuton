import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("clerk"), v.literal("applicant"));

export const crawlStatusValidator = v.union(
  v.literal("queued"),
  v.literal("discovering"),
  v.literal("fetching"),
  v.literal("extracting"),
  v.literal("review"),
  v.literal("done"),
  v.literal("failed"),
);

export const crawlSourceValidator = v.union(v.literal("firecrawl"), v.literal("legistar"), v.literal("csv"));

export const documentKindValidator = v.union(
  v.literal("unclassified"),
  v.literal("roster"),
  v.literal("vacancy_notice"),
  v.literal("rules_page"),
  v.literal("other"),
);

export const confidenceValidator = v.union(v.literal("grounded"), v.literal("inferred"), v.literal("unknown"));

export const draftMemberValidator = v.object({
  name: v.string(),
  role: v.union(v.string(), v.null()),
  appointed: v.union(v.string(), v.null()),
  termEnd: v.union(v.string(), v.null()),
  snippet: v.string(),
  confidence: confidenceValidator,
});

export const draftStatusValidator = v.union(v.literal("pending"), v.literal("confirmed"), v.literal("dismissed"));

export const applicationStateValidator = v.union(
  v.literal("received"),
  v.literal("under_review"),
  v.literal("interviewed"),
  v.literal("appointed"),
  v.literal("declined"),
);

export const noticeKindValidator = v.union(v.literal("term_expiry"), v.literal("reappointment"));
export const noticeStatusValidator = v.union(v.literal("draft"), v.literal("approved"), v.literal("sent"), v.literal("failed"));

export const threadKindValidator = v.union(v.literal("application"), v.literal("member"));

export const driftStatusValidator = v.union(v.literal("open"), v.literal("resolved"));

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(roleValidator),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  cities: defineTable({
    name: v.string(),
    domain: v.string(),
    slug: v.string(),
    websiteUrl: v.string(),
    status: v.union(v.literal("draft"), v.literal("confirmed")),
    inboxId: v.optional(v.string()),
    inboxAddress: v.optional(v.string()),
    expiringDays: v.optional(v.number()),
  })
    .index("by_domain", ["domain"])
    .index("by_slug", ["slug"]),
  bodies: defineTable({
    cityId: v.id("cities"),
    name: v.string(),
    meetingCadence: v.optional(v.string()),
    termLength: v.optional(v.string()),
    termLimit: v.optional(v.string()),
    seatCount: v.optional(v.number()),
    expiringDays: v.optional(v.number()),
    sourceUrl: v.string(),
    confirmed: v.boolean(),
    acceptsApplications: v.optional(v.boolean()),
  }).index("by_city", ["cityId"]),
  seats: defineTable({
    bodyId: v.id("bodies"),
    ordinal: v.number(),
    label: v.optional(v.string()),
    vacant: v.optional(v.boolean()),
  }).index("by_body", ["bodyId"]),
  members: defineTable({
    cityId: v.id("cities"),
    name: v.string(),
    email: v.optional(v.string()),
  }).index("by_city", ["cityId"]),
  terms: defineTable({
    seatId: v.id("seats"),
    memberId: v.id("members"),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    rawStart: v.optional(v.string()),
    rawEnd: v.optional(v.string()),
    sourceUrl: v.string(),
    snippet: v.string(),
    current: v.boolean(),
  }).index("by_seat", ["seatId"]),
  crawlRuns: defineTable({
    cityId: v.id("cities"),
    purpose: v.union(v.literal("bootstrap"), v.literal("drift")),
    source: crawlSourceValidator,
    status: crawlStatusValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    pageCount: v.number(),
    documentCount: v.number(),
    draftCount: v.number(),
    error: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    firecrawlCrawlId: v.optional(v.string()),
    log: v.array(v.object({ at: v.number(), message: v.string() })),
  })
    .index("by_city", ["cityId"])
    .index("by_city_purpose", ["cityId", "purpose"]),
  documents: defineTable({
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    url: v.string(),
    title: v.optional(v.string()),
    contentType: v.optional(v.string()),
    kind: documentKindValidator,
    storageId: v.optional(v.id("_storage")),
    textPreview: v.optional(v.string()),
    fetchedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_run", ["crawlRunId"])
    .index("by_city", ["cityId"]),
  drafts: defineTable({
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    documentId: v.optional(v.id("documents")),
    name: v.string(),
    meetingCadence: v.union(v.string(), v.null()),
    termLength: v.union(v.string(), v.null()),
    termLimit: v.union(v.string(), v.null()),
    seatCount: v.union(v.number(), v.null()),
    members: v.array(draftMemberValidator),
    snippet: v.string(),
    sourceUrl: v.string(),
    status: draftStatusValidator,
    confirmedBodyId: v.optional(v.id("bodies")),
  })
    .index("by_city", ["cityId"])
    .index("by_run", ["crawlRunId"]),
  applications: defineTable({
    cityId: v.id("cities"),
    bodyId: v.optional(v.id("bodies")),
    seatId: v.optional(v.id("seats")),
    applicantName: v.string(),
    email: v.string(),
    statement: v.string(),
    state: applicationStateValidator,
    threadId: v.optional(v.id("threads")),
    updatedAt: v.number(),
  })
    .index("by_city", ["cityId"])
    .index("by_body", ["bodyId"]),
  applicationEvents: defineTable({
    applicationId: v.id("applications"),
    state: applicationStateValidator,
    note: v.optional(v.string()),
    replyText: v.optional(v.string()),
    outboundId: v.optional(v.string()),
    at: v.number(),
  }).index("by_application", ["applicationId"]),
  notices: defineTable({
    cityId: v.id("cities"),
    bodyId: v.id("bodies"),
    seatId: v.id("seats"),
    memberId: v.id("members"),
    kind: noticeKindValidator,
    subject: v.string(),
    body: v.string(),
    status: noticeStatusValidator,
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    outboundId: v.optional(v.string()),
    threadId: v.optional(v.id("threads")),
    error: v.optional(v.string()),
  })
    .index("by_city", ["cityId"])
    .index("by_seat", ["seatId"]),
  threads: defineTable({
    cityId: v.id("cities"),
    kind: threadKindValidator,
    applicationId: v.optional(v.id("applications")),
    memberId: v.optional(v.id("members")),
    inboxId: v.string(),
    agentmailThreadId: v.optional(v.string()),
    lastMessageId: v.optional(v.string()),
    counterpartEmail: v.string(),
    subject: v.string(),
    lastMessageAt: v.number(),
  })
    .index("by_city", ["cityId"])
    .index("by_agentmail_thread", ["agentmailThreadId"])
    .index("by_application", ["applicationId"]),
  messages: defineTable({
    threadId: v.id("threads"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    agentmailMessageId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    at: v.number(),
  }).index("by_thread", ["threadId"]),
  driftFlags: defineTable({
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    bodyId: v.optional(v.id("bodies")),
    seatId: v.optional(v.id("seats")),
    field: v.string(),
    published: v.string(),
    tracked: v.string(),
    sourceUrl: v.string(),
    snippet: v.optional(v.string()),
    status: driftStatusValidator,
    resolvedAt: v.optional(v.number()),
  })
    .index("by_city", ["cityId"])
    .index("by_city_status", ["cityId", "status"]),
});
