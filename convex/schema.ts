import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("clerk"), v.literal("applicant"));

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
    status: v.union(v.literal("draft"), v.literal("confirmed")),
  }).index("by_domain", ["domain"]),
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
  }).index("by_city", ["cityId"]),
  seats: defineTable({
    bodyId: v.id("bodies"),
    ordinal: v.number(),
    label: v.optional(v.string()),
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
});
