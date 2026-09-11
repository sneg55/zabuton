import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { createDriftRun } from "./drift";
import { IN_PROGRESS_STATUSES } from "./lib/discover";
import { workflow } from "./workflow";

export const driftAllConfirmedCities = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ started: number }> => {
    const cities = await ctx.db.query("cities").collect();
    const now = Date.now();
    let started = 0;
    for (const city of cities) {
      if (city.status !== "confirmed") continue;
      const runs = await ctx.db
        .query("crawlRuns")
        .withIndex("by_city", (q) => q.eq("cityId", city._id))
        .collect();
      const running = runs.some((run) =>
        IN_PROGRESS_STATUSES.includes(run.status as (typeof IN_PROGRESS_STATUSES)[number]),
      );
      if (running) continue;
      const crawlRunId: Id<"crawlRuns"> = await createDriftRun(ctx, city._id, now);
      const workflowId = await workflow.start(
        ctx,
        internal.drift.driftWorkflow,
        { cityId: city._id, crawlRunId },
        { onComplete: internal.bootstrap.onRunComplete, context: { crawlRunId } },
      );
      await ctx.db.patch(crawlRunId, { workflowId });
      started += 1;
    }
    return { started };
  },
});

const crons = cronJobs();

crons.daily("drift check", { hourUTC: 11, minuteUTC: 0 }, internal.crons.driftAllConfirmedCities, {});

export default crons;
