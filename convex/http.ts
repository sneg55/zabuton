import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { agentMail } from "./mail";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) =>
    agentMail.handleWebhook(ctx as unknown as Parameters<typeof agentMail.handleWebhook>[0], req),
  ),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
