import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_EXPIRING_DAYS, isVacancyName, seatStatus, type Occupancy, type SeatStatus } from "./lib/seatStatus";

export type SeatRow = {
  seat: Doc<"seats">;
  term: Doc<"terms"> | null;
  member: Doc<"members"> | null;
  status: SeatStatus;
};

export type StatusCounts = Record<SeatStatus, number>;

const emptyCounts = (): StatusCounts => ({ vacant: 0, expired: 0, expiring: 0, active: 0, unlisted: 0 });

function occupancyOf(seat: Doc<"seats">, term: Doc<"terms"> | null, member: Doc<"members"> | null): Occupancy {
  if (term && member) return isVacancyName(member.name) ? "vacant" : "held";
  return seat.vacant ? "vacant" : "unlisted";
}

async function seatRows(ctx: QueryCtx, body: Doc<"bodies">, now: number): Promise<SeatRow[]> {
  const threshold = body.expiringDays ?? DEFAULT_EXPIRING_DAYS;
  const seats = await ctx.db
    .query("seats")
    .withIndex("by_body", (q) => q.eq("bodyId", body._id))
    .collect();
  seats.sort((a, b) => a.ordinal - b.ordinal);
  const rows: SeatRow[] = [];
  for (const seat of seats) {
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
      .collect();
    const term = terms.find((t) => t.current) ?? null;
    const member = term ? await ctx.db.get(term.memberId) : null;
    const occupancy = occupancyOf(seat, term, member);
    rows.push({ seat, term: occupancy === "held" ? term : null, member: occupancy === "held" ? member : null, status: seatStatus(term?.endsAt ?? null, now, threshold, occupancy) });
  }
  return rows;
}

export const board = query({
  args: { bodyId: v.id("bodies"), now: v.optional(v.number()) },
  handler: async (ctx, { bodyId, now }) => {
    const body = await ctx.db.get(bodyId);
    if (!body) return null;
    return { body, seats: await seatRows(ctx, body, now ?? Date.now()) };
  },
});

export const city = query({
  args: { cityId: v.id("cities"), now: v.optional(v.number()) },
  handler: async (ctx, { cityId, now }) => {
    const at = now ?? Date.now();
    const bodies = await ctx.db
      .query("bodies")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    const out: Array<{ body: Doc<"bodies">; counts: StatusCounts }> = [];
    for (const body of bodies) {
      const counts = emptyCounts();
      for (const row of await seatRows(ctx, body, at)) counts[row.status] += 1;
      out.push({ body, counts });
    }
    out.sort((a, b) => a.body.name.localeCompare(b.body.name));
    return out;
  },
});

export const cities = query({
  args: {},
  handler: async (ctx) => ctx.db.query("cities").collect(),
});

export const cityBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) =>
    ctx.db
      .query("cities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

export const cityById = query({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }) => ctx.db.get(cityId),
});

export const openings = query({
  args: { cityId: v.id("cities"), now: v.optional(v.number()) },
  handler: async (ctx, { cityId, now }) => {
    const at = now ?? Date.now();
    const bodies = await ctx.db
      .query("bodies")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    const out: Array<{ body: Doc<"bodies">; row: SeatRow }> = [];
    for (const body of bodies) {
      for (const row of await seatRows(ctx, body, at)) {
        if (row.status !== "active" && row.status !== "unlisted") out.push({ body, row });
      }
    }
    const rank: Record<SeatStatus, number> = { vacant: 0, expired: 1, expiring: 2, active: 3, unlisted: 4 };
    out.sort((a, b) => rank[a.row.status] - rank[b.row.status] || a.body.name.localeCompare(b.body.name));
    return out;
  },
});

export const appointments = query({
  args: { cityId: v.id("cities"), now: v.optional(v.number()) },
  handler: async (ctx, { cityId, now }) => {
    const at = now ?? Date.now();
    const bodies = await ctx.db
      .query("bodies")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    bodies.sort((a, b) => a.name.localeCompare(b.name));
    const out: Array<{ body: Doc<"bodies">; seats: SeatRow[] }> = [];
    for (const body of bodies) {
      if (!body.confirmed) continue;
      out.push({ body, seats: await seatRows(ctx, body, at) });
    }
    return out;
  },
});

export type CityId = Id<"cities">;
