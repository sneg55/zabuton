import { AgentMail } from "@agentmail/convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const agentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.mail.onMessageReceived,
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async () => {
    return null;
  },
});
