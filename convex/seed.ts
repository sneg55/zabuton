import { internalMutation } from "./_generated/server";
import { normalizeTermEnd } from "./lib/termDates";
import roster from "./seed/dublinRoster.json";
import rules from "./seed/dublinRules.json";

const ROSTER_URL = "https://dublin.ca.gov/DocumentCenter/View/36214/Maddy-Act-2024---Jan-10";
const RULES_URL = "https://www.dublin.ca.gov/74";

type ExtractedMember = {
  name: string;
  role: string | null;
  appointed: string | null;
  term_end: string | null;
  snippet: string;
  confidence: "grounded" | "inferred" | "unknown";
};

type ExtractedBody = {
  name: string;
  meeting_cadence: string | null;
  term_length: string | null;
  term_limit: string | null;
  seat_count: number | null;
  members: ExtractedMember[];
  snippet: string;
};

const canonical = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, " ").trim();

export const loadDublin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("cities")
      .withIndex("by_domain", (q) => q.eq("domain", "dublin.ca.gov"))
      .unique();
    if (existing) return { cityId: existing._id, created: false };
    const cityId = await ctx.db.insert("cities", { name: "Dublin, CA", domain: "dublin.ca.gov", status: "draft" });
    const rulesByName = new Map((rules as { bodies: ExtractedBody[] }).bodies.map((b) => [canonical(b.name), b]));
    for (const body of (roster as { bodies: ExtractedBody[] }).bodies) {
      const rule = rulesByName.get(canonical(body.name));
      const bodyId = await ctx.db.insert("bodies", {
        cityId,
        name: body.name,
        meetingCadence: body.meeting_cadence ?? rule?.meeting_cadence ?? undefined,
        termLength: body.term_length ?? rule?.term_length ?? undefined,
        termLimit: body.term_limit ?? rule?.term_limit ?? undefined,
        seatCount: body.seat_count ?? undefined,
        sourceUrl: ROSTER_URL,
        confirmed: false,
      });
      let ordinal = 0;
      for (const m of body.members) {
        ordinal += 1;
        const memberId = await ctx.db.insert("members", { cityId, name: m.name });
        const seatId = await ctx.db.insert("seats", { bodyId, ordinal, label: m.role ?? undefined });
        await ctx.db.insert("terms", {
          seatId,
          memberId,
          endsAt: normalizeTermEnd(m.term_end) ?? undefined,
          rawEnd: m.term_end ?? undefined,
          rawStart: m.appointed ?? undefined,
          sourceUrl: ROSTER_URL,
          snippet: m.snippet,
          current: true,
        });
      }
    }
    return { cityId, created: true, rulesUrl: RULES_URL };
  },
});
