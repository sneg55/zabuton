import type { convexTest } from "convex-test";
import type { Id } from "./convex/_generated/dataModel";

export type TestConvex = ReturnType<typeof convexTest>;

export type Fixture = {
  cityId: Id<"cities">;
  bodyId: Id<"bodies">;
  seatId: Id<"seats">;
  otherSeatId: Id<"seats">;
  memberId: Id<"members">;
  termId: Id<"terms">;
};

export const FIXTURE_NOW = Date.UTC(2026, 8, 11, 12, 0, 0);

export async function seedCity(t: TestConvex, termLength: string | null = "four years"): Promise<Fixture> {
  return t.run(async (ctx) => {
    const cityId = await ctx.db.insert("cities", {
      name: "Dublin",
      domain: "dublin.ca.gov",
      slug: "dublin",
      websiteUrl: "https://dublin.ca.gov",
      status: "confirmed",
    });
    const bodyId = await ctx.db.insert("bodies", {
      cityId,
      name: "Planning Commission",
      sourceUrl: "https://dublin.ca.gov/planning",
      confirmed: true,
      termLength: termLength ?? undefined,
      meetingCadence: "second and fourth Tuesdays",
    });
    const seatId = await ctx.db.insert("seats", { bodyId, ordinal: 1, label: "Seat 1" });
    const otherSeatId = await ctx.db.insert("seats", { bodyId, ordinal: 2, label: "Seat 2" });
    const memberId = await ctx.db.insert("members", { cityId, name: "Bo Ito" });
    const termId = await ctx.db.insert("terms", {
      seatId,
      memberId,
      endsAt: Date.UTC(2026, 11, 31, 23, 59, 59),
      rawEnd: "12/26",
      sourceUrl: "https://dublin.ca.gov/planning",
      snippet: "Bo Ito, term ends 12/26",
      current: true,
    });
    return { cityId, bodyId, seatId, otherSeatId, memberId, termId };
  });
}

export async function flushMail(t: TestConvex): Promise<void> {
  await t.finishAllScheduledFunctions(() => {});
}

export async function asClerk(t: TestConvex): Promise<TestConvex> {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Clerk", role: "clerk" }));
  return t.withIdentity({ subject: `${userId}|session` }) as TestConvex;
}

export async function asApplicant(t: TestConvex): Promise<TestConvex> {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Resident", role: "applicant" }));
  return t.withIdentity({ subject: `${userId}|session` }) as TestConvex;
}
